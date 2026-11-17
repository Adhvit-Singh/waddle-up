import { Time } from '../core/time.ts';
import { Loop } from '../core/loop.ts';
import { refs } from '../core/refs.ts';
import { UnityRandom } from '../core/rng.ts';
import { lerp } from '../core/math.ts';
import { AudioManager } from '../audio/AudioManager.ts';

export const ChaosMode = { None: 0, Inverted: 1, Mirrored: 2, Rotated: 3 } as const;
export type ChaosMode = (typeof ChaosMode)[keyof typeof ChaosMode];

export function chaosModeName(m: number) {
  switch (m) {
    case ChaosMode.Inverted: return 'INVERTED';
    case ChaosMode.Mirrored: return 'MIRRORED';
    case ChaosMode.Rotated: return 'ROTATED 90°';
    default: return '';
  }
}

/** Randomly flips the controls for a while, with a tiny warning first. */
export class ControlChaos {
  static instance: ControlChaos;
  static mode: ChaosMode = ChaosMode.None;
  private nextFlip = 0; private endTime = 0; private warnUntil = 0;
  private warning = false;
  private pending: ChaosMode = ChaosMode.None; private last: ChaosMode = ChaosMode.None;

  constructor() {
    ControlChaos.instance = this;
    refs.chaos = ControlChaos.apply;
    this.resetTimer();
    Loop.add(this);
  }

  resetTimer() {
    ControlChaos.mode = ChaosMode.None;
    this.warning = false;
    this.nextFlip = Time.time + UnityRandom.range(40, 80);
    refs.ui?.setChaos(false, ChaosMode.None);
  }

  static apply(m: { x: number; y: number }) {
    switch (ControlChaos.mode) {
      case ChaosMode.Inverted: return { x: -m.x, y: -m.y };
      case ChaosMode.Mirrored: return { x: -m.x, y: m.y };
      case ChaosMode.Rotated: return { x: m.y, y: -m.x };
      default: return m;
    }
  }

  update() {
    const gm = refs.game, pc = refs.penguin;
    if (!gm || !pc) return;
    if (!gm.isPlaying || pc.locked) {
      // freeze timers while paused / in cutscenes
      this.nextFlip += Time.deltaTime; this.endTime += Time.deltaTime; this.warnUntil += Time.deltaTime;
      return;
    }
    if (gm.currentStage < 2 && ControlChaos.mode === ChaosMode.None && !this.warning) { this.nextFlip = Math.max(this.nextFlip, Time.time + 10); return; }

    if (ControlChaos.mode === ChaosMode.None && !this.warning && Time.time >= this.nextFlip) {
      this.warning = true;
      this.warnUntil = Time.time + 2.5;
      do this.pending = UnityRandom.rangeInt(1, 4) as ChaosMode; while (this.pending === this.last);
      refs.ui?.setChaosWarning(true);
      AudioManager.play('warn', 0.6);
    } else if (this.warning && Time.time >= this.warnUntil) {
      this.warning = false;
      ControlChaos.mode = this.pending; this.last = this.pending;
      const stage01 = gm.currentStage / 19;
      this.endTime = Time.time + UnityRandom.range(12, 18) + stage01 * 8;
      refs.ui?.setChaosWarning(false);
      refs.ui?.setChaos(true, ControlChaos.mode);
      gm.data.inversions++;
      AudioManager.play('flip', 0.6);
    } else if (ControlChaos.mode !== ChaosMode.None && Time.time >= this.endTime) {
      ControlChaos.mode = ChaosMode.None;
      const stage01 = gm.currentStage / 19;
      this.nextFlip = Time.time + UnityRandom.range(35, 90) * lerp(1, 0.6, stage01);
      refs.ui?.setChaos(false, ChaosMode.None);
      AudioManager.play('chime', 0.5);
    }
  }
}
