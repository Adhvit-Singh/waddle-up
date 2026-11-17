import * as THREE from 'three';
import { UnityRandom } from '../core/rng.ts';
import { Time } from '../core/time.ts';
import { Scheduler, type Co } from '../core/coroutines.ts';
import { refs } from '../core/refs.ts';
import { lerp, css } from '../core/math.ts';
import { LedgeKind } from '../core/StageData.ts';
import { AudioManager } from '../audio/AudioManager.ts';
import { Taunts } from './Taunts.ts';
import { SaveSystem } from '../core/SaveSystem.ts';
import type { Ledge } from '../world/Ledge.ts';

export type TrapType = 'None' | 'Crumble' | 'Sneeze' | 'Gust' | 'Ice' | 'Shy' | 'Bounce' | 'Snowball' | 'CameraFlip' | 'Gravity' | 'Blackout' | 'Trapdoor' | 'Achievement' | 'External';

interface TrapDef { type: TrapType; minStage: number; weight: number; }

const DEFS: TrapDef[] = [
  { type: 'Crumble', minStage: 1, weight: 1.2 },
  { type: 'Sneeze', minStage: 1, weight: 0.8 },
  { type: 'Achievement', minStage: 1, weight: 0.35 },
  { type: 'Gust', minStage: 2, weight: 1.0 },
  { type: 'Ice', minStage: 2, weight: 0.9 },
  { type: 'Shy', minStage: 3, weight: 1.0 },
  { type: 'Bounce', minStage: 3, weight: 0.7 },
  { type: 'Snowball', minStage: 4, weight: 0.8 },
  { type: 'CameraFlip', minStage: 5, weight: 0.6 },
  { type: 'Gravity', minStage: 6, weight: 0.7 },
  { type: 'Blackout', minStage: 8, weight: 0.6 },
  { type: 'Trapdoor', minStage: 9, weight: 0.12 },
];

const COOLDOWN = 4;

/** Hook for spawning the snowball (needs the scene + physics; injected by the game). */
export type SnowballSpawner = (from: THREE.Vector3) => void;

/**
 * Random troll traps. Rolled when the penguin lands on a new ledge. Rare low down, frequent and nasty high up.
 * No-repeat rule: a trap that caused a fall is banned at that ledge for the rest of the run, and that ledge
 * is trap-free on its next visit.
 */
export class TrapDirector {
  static instance: TrapDirector;
  private banned = new Set<string>();
  private grace = new Set<number>();
  private lastLandIndex = -1;
  private lastTrapTime = -99;
  private lastTrapdoorTime = -9999;
  private lastTrapType: TrapType = 'None';
  private lastTrapLedge = -1;
  private shyArmed: Ledge | null = null;
  trapsFired = 0;
  /** every (ledge, trap) that fired this game: never repeats this game */
  private fired = new Set<string>();
  /** pairs from the previous game: avoided this game */
  private lastRun = new Set<string>();
  lastFired: { type: TrapType; ledge: number } | null = null;
  private getLedge: (i: number) => Ledge | null;
  spawnSnowball: SnowballSpawner = () => {};

  constructor(getLedge: (i: number) => Ledge | null) {
    TrapDirector.instance = this;
    this.getLedge = getLedge;
    refs.traps = this;
  }

  static chanceFor(stage: number) { return stage < 1 ? 0 : lerp(0.10, 0.45, (stage - 1) / 18); }

  /** start/resume a game: bans (fell-after-trap), traps already fired this game, and last game's pairs to avoid */
  loadRun(bans: string[] | null | undefined, fired: string[] | null | undefined, lastRun: string[] | null | undefined) {
    this.loadBans(bans);
    this.fired = new Set(fired ?? []);
    this.lastRun = new Set(lastRun ?? []);
  }

  exportFired() { return [...this.fired]; }

  /** the game ended (summit, or abandoned by New Game): remember its traps so the next game differs */
  endRun() { SaveSystem.lastRunTraps = [...this.fired]; }

  loadBans(list: string[] | null | undefined) {
    this.banned.clear(); this.grace.clear();
    if (list) for (const s of list) this.banned.add(s);
    this.lastLandIndex = -1; this.lastTrapTime = -99; this.lastTrapType = 'None'; this.shyArmed = null;
  }

  exportBans() { return [...this.banned]; }

  private static key(ledge: number, t: TrapType) { return `${ledge}:${t}`; }
  isBanned(ledge: number, t: TrapType) { return this.banned.has(TrapDirector.key(ledge, t)); }

  /** Fixed hazards (sweepers, spring flags) register so falls get attributed for taunts. */
  registerExternalTrap(_what: string) {
    this.lastTrapTime = Time.time;
    this.lastTrapType = 'External';
    this.lastTrapLedge = this.lastLandIndex;
  }

  onLanded(l: Ledge | null, _impact: number) {
    if (!l || l.index < 0) return;
    if (!refs.game?.isPlaying) return;
    if (l.index === this.lastLandIndex) return;
    this.lastLandIndex = l.index;
    if (this.grace.delete(l.index)) return;
    if (Time.time - this.lastTrapTime < COOLDOWN) return;
    if (l.stage < 1 || l.kind === LedgeKind.Rest) return;

    if (UnityRandom.value() > TrapDirector.chanceFor(l.stage)) return;

    const type = this.pickTrap(l);
    if (type === 'None') return;
    this.fire(type, l);
  }

  private pickTrap(l: Ledge): TrapType {
    let total = 0;
    const cands: TrapDef[] = [];
    for (const d of DEFS) {
      if (l.stage < d.minStage) continue;
      if (this.isBanned(l.index, d.type)) continue;
      const k = TrapDirector.key(l.index, d.type);
      if (this.fired.has(k) || this.lastRun.has(k)) continue;
      if (!this.applicable(d.type, l)) continue;
      let w = d.weight;
      // nastier higher up
      if (d.type === 'Gust' || d.type === 'Shy' || d.type === 'Crumble') w *= 1 + l.stage * 0.05;
      if (d.type === 'Achievement' || d.type === 'Sneeze') w *= lerp(1.3, 0.5, l.stage / 19);
      cands.push({ type: d.type, minStage: d.minStage, weight: w });
      total += w;
    }
    if (cands.length === 0) return 'None';
    let r = UnityRandom.value() * total;
    for (const c of cands) { r -= c.weight; if (r <= 0) return c.type; }
    return cands[cands.length - 1].type;
  }

  private applicable(t: TrapType, l: Ledge) {
    switch (t) {
      case 'Crumble': return l.canCrumble && l.kind !== LedgeKind.Crumble;
      case 'Ice': return !l.isIcy;
      case 'Shy': {
        const next = this.getLedge(l.index + 1);
        return next != null && !next.isDynamic && next.stage === l.stage;
      }
      case 'Snowball': return this.getLedge(l.index + 3) != null;
      case 'Trapdoor': return Time.time - this.lastTrapdoorTime > 600;
      default: return true;
    }
  }

  private fire(type: TrapType, l: Ledge) {
    this.fired.add(TrapDirector.key(l.index, type));
    this.lastFired = { type, ledge: l.index };
    if (type !== 'Achievement') {
      this.lastTrapTime = Time.time;
      this.lastTrapType = type;
      this.lastTrapLedge = l.index;
      this.trapsFired++;
      if (refs.game) refs.game.data.trapsTriggered++;
    }
    Scheduler.start(this, this.run(type, l));
  }

  private *run(type: TrapType, l: Ledge): Co {
    const pc = refs.penguin;
    const ui = refs.ui;
    switch (type) {
      case 'Crumble':
        l.crumble(0.6, 4);
        break;

      case 'Sneeze':
        yield 0.4;
        AudioManager.play('sneeze', 0.9);
        ui?.toast('*ACHOO!*', css(1, 1, 1), 0.6);
        if (pc && (pc.grounded || pc.state === 1 /* Air */)) {
          const side = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), pc.facing).normalize().multiplyScalar(UnityRandom.value() < 0.5 ? -1 : 1);
          pc.launch(side.multiplyScalar(UnityRandom.range(2.5, 3.8)).add(new THREE.Vector3(0, 3.6, 0)).addScaledVector(pc.facing, -0.8), 0.2);
        }
        break;

      case 'Gust':
        AudioManager.play('whistle', 0.5);
        yield 0.45;
        refs.wind?.gustAtPenguin(10 + l.stage * 0.6, 1.4);
        ui?.taunt('Breezy today, huh?');
        break;

      case 'Ice':
        l.makeIcy(7);
        AudioManager.play('freeze', 0.8);
        ui?.toast('This ledge has been upgraded to: ICE', css(0.6, 0.9, 1));
        break;

      case 'Shy':
        this.shyArmed = l;
        break;

      case 'Bounce':
        yield 0.35;
        if (pc && pc.groundLedge === l) {
          const r = UnityRandom.insideUnitSphere();
          const rnd = new THREE.Vector3(r.x, 0, r.z).normalize();
          pc.launch(new THREE.Vector3(0, 9.5, 0).addScaledVector(rnd, 2.8), 0.25);
          AudioManager.play('bounce');
          ui?.taunt('Boing.');
        }
        break;

      case 'Snowball': {
        const src = this.getLedge(l.index + 3) ?? this.getLedge(l.index + 2);
        if (src) this.spawnSnowball(src.position.clone().add(new THREE.Vector3(0, 3.5, 0)));
        break;
      }

      case 'CameraFlip':
        refs.cam?.flip180();
        ui?.taunt('Wrong way? No, wrong camera.');
        break;

      case 'Gravity':
        if (!pc) break;
        AudioManager.play('float', 0.7);
        ui?.toast('Gravity is on a coffee break', css(0.8, 0.7, 1));
        pc.gravityScale = 0.35;
        yield 2.6;
        ui?.toast('Gravity is back. And angry.', css(1, 0.6, 0.6));
        pc.gravityScale = 1.9;
        yield 1.1;
        pc.gravityScale = 1;
        break;

      case 'Blackout':
        AudioManager.play('powerdown', 0.8);
        ui?.blackout(1.7, 'power saving mode');
        break;

      case 'Trapdoor':
        this.lastTrapdoorTime = Time.time;
        yield 0.5;
        if (pc && pc.groundLedge === l) refs.game?.sendToStageStart("The mountain's refund policy: back to the start of the stage.");
        else this.lastTrapdoorTime = -9999;
        break;

      case 'Achievement':
        AudioManager.play('achievement', 0.7);
        ui?.achievement(Taunts.pick(Taunts.Achievements));
        break;
    }
  }

  onJumped(from: Ledge | null) {
    if (this.shyArmed == null || from !== this.shyArmed) { if (from !== this.shyArmed) this.shyArmed = null; return; }
    const next = this.getLedge(from.index + 1);
    this.shyArmed = null;
    if (!next) return;
    const off = next.forward.multiplyScalar(1.1).addScaledVector(next.right, 0.5);
    next.scoot(off, 2.2);
    AudioManager.play('scoot', 0.8);
    refs.ui?.taunt('That ledge is shy.');
  }

  onFell(_drop: number) {
    if (Time.time - this.lastTrapTime < 5 && this.lastTrapType !== 'None' && this.lastTrapType !== 'External' && this.lastTrapLedge >= 0) {
      this.banned.add(TrapDirector.key(this.lastTrapLedge, this.lastTrapType));
      this.grace.add(this.lastTrapLedge);
      this.lastTrapType = 'None';
    }
  }
}

