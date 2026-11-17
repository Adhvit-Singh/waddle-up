import * as THREE from 'three';
import { Time } from '../core/time.ts';
import { Loop } from '../core/loop.ts';
import { refs } from '../core/refs.ts';
import { UnityRandom } from '../core/rng.ts';
import { inverseLerp } from '../core/math.ts';
import { STAGES } from '../core/StageData.ts';
import { AudioManager } from '../audio/AudioManager.ts';
import { Effects, type ParticleSystem } from '../world/Effects.ts';

/** Periodic gusts in windy stages + trap gusts. Pushes the penguin and shows streaks. */
export class WindSystem {
  static instance: WindSystem;
  private streaks: ParticleSystem | null = null;
  private gustDir = new THREE.Vector3();
  private gustStrength = 0; private gustUntil = 0; private nextStageGust = 0;
  private warned = false;
  private summitY: () => number;

  constructor(summitY: () => number) {
    WindSystem.instance = this;
    this.summitY = summitY;
    refs.wind = this;
    Loop.addFirst(this); // [DefaultExecutionOrder(-50)]: push before the penguin integrates
  }

  init(follow: THREE.Object3D) {
    this.streaks = Effects.windStreaks(follow);
    this.nextStageGust = Time.time + 4;
  }

  get gustActive() { return Time.time < this.gustUntil; }

  gust(dir: THREE.Vector3, strength: number, duration: number) {
    dir = dir.clone(); dir.y = 0;
    this.gustDir.copy(dir.normalize());
    this.gustStrength = strength;
    this.gustUntil = Time.time + duration;
    AudioManager.play('gust', 0.9);
  }

  /** A gust that pushes the penguin off the path (outward), with some tangential randomness. */
  gustAtPenguin(strength: number, duration: number) {
    const pc = refs.penguin;
    if (!pc) return;
    const outward = pc.position; outward.y = 0; outward.normalize();
    const tangent = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), outward);
    this.gust(outward.addScaledVector(tangent, UnityRandom.range(-0.8, 0.8)), strength, duration);
  }

  update() {
    const gm = refs.game, pc = refs.penguin;
    const windyStage = gm != null && gm.isPlaying && gm.currentStage >= 0 && STAGES[gm.currentStage].wind;
    if (windyStage && pc && !pc.locked) {
      if (!this.warned && Time.time >= this.nextStageGust - 0.8) { this.warned = true; AudioManager.play('whistle', 0.5); }
      if (Time.time >= this.nextStageGust) {
        this.warned = false;
        const s = 9 + gm!.currentStage * 0.45;
        this.gustAtPenguin(s, UnityRandom.range(1.1, 1.8));
        this.nextStageGust = Time.time + UnityRandom.range(4, 7.5);
      }
    } else this.nextStageGust = Math.max(this.nextStageGust, Time.time + 3);

    if (this.streaks) {
      this.streaks.rate = this.gustActive ? 140 : (windyStage ? 6 : 0);
      const v = (this.gustActive ? this.gustDir.clone() : new THREE.Vector3(1, 0, 0)).multiplyScalar(26);
      this.streaks.cfg.velocityOverride!.set(v.x, 0, v.z);
    }
    if (pc && gm) {
      const h01 = inverseLerp(0, this.summitY(), pc.position.y);
      AudioManager.setWindAmbient(0.15 + h01 * 0.35 + (windyStage ? 0.25 : 0) + (this.gustActive ? 0.4 : 0));
    }
  }

  fixedUpdate() {
    const pc = refs.penguin;
    if (!pc || !this.gustActive || pc.hanging) return;
    pc.externalAccel.addScaledVector(this.gustDir, this.gustStrength * (pc.grounded ? 1 : 0.7));
  }
}
