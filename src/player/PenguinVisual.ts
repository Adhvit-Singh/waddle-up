import * as THREE from 'three';
import { Time } from '../core/time.ts';
import { Loop } from '../core/loop.ts';
import { UnityRandom } from '../core/rng.ts';
import { col, clamp, clamp01, lerp, moveTowards, moveTowardsAngle, eulerDeg, Rad2Deg } from '../core/math.ts';
import { MeshBuilder, meshObject } from '../world/MeshKit.ts';
import { MOVE_SPEED } from '../world/MountainData.ts';
import { PenguinController, PState } from './PenguinController.ts';

const NAVY = col(0.13, 0.15, 0.24);
const BELLY = col(0.97, 0.97, 0.95);
const ORANGE = col(1, 0.55, 0.12);
const RED = col(0.9, 0.2, 0.22);
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

/** Builds the low-poly penguin out of procedural parts and animates it procedurally. */
export class PenguinVisual {
  private pc: PenguinController;
  private root = new THREE.Group();
  private body!: THREE.Object3D; private head!: THREE.Object3D; private flipL!: THREE.Object3D; private flipR!: THREE.Object3D;
  private footL!: THREE.Object3D; private footR!: THREE.Object3D; private eyeL!: THREE.Object3D; private eyeR!: THREE.Object3D;
  private waddle = 0; private blinkTimer = 2; private blink = 0; private squash = 1; private flop = 0;
  private yaw = 0;

  constructor(pc: PenguinController) {
    this.pc = pc;
    this.root.name = 'PenguinModel';
    pc.object.add(this.root);
    this.build();
    Loop.add(this);
  }

  private part(name: string, parent: THREE.Object3D, localPos: THREE.Vector3, build: (mb: MeshBuilder) => void) {
    const mb = new MeshBuilder();
    build(mb);
    const m = meshObject(name, mb.build(), parent);
    m.position.copy(localPos);
    return m;
  }

  private pivot(name: string, parent: THREE.Object3D, localPos: THREE.Vector3, build: (mb: MeshBuilder) => void) {
    const p = new THREE.Group();
    p.name = name + 'Pivot';
    p.position.copy(localPos);
    parent.add(p);
    this.part(name, p, V(), build);
    return p;
  }

  private build() {
    this.body = this.part('Body', this.root, V(0, 0.5, 0), mb => {
      mb.sphere(V(), V(0.36, 0.44, 0.32), NAVY, 10, 7);
      mb.sphere(V(0, -0.04, 0.13), V(0.27, 0.36, 0.22), BELLY, 10, 7);
    });
    this.head = this.part('Head', this.body, V(0, 0.46, 0.02), mb => {
      mb.sphere(V(), V(0.27, 0.25, 0.26), NAVY, 10, 7);
      mb.sphere(V(0, -0.02, 0.11), V(0.2, 0.17, 0.17), BELLY, 9, 6);
      mb.coneAxis(V(0, -0.04, 0.25), V(0, -0.15, 1), 0.075, 0.2, ORANGE, 6);
      mb.sphere(V(0.14, -0.07, 0.19), V(0.045, 0.03, 0.02), col(1, 0.55, 0.6), 5, 3);
      mb.sphere(V(-0.14, -0.07, 0.19), V(0.045, 0.03, 0.02), col(1, 0.55, 0.6), 5, 3);
    });
    // mismatched googly eyes
    this.eyeL = this.part('EyeL', this.head, V(0.085, 0.05, 0.22), mb => {
      mb.sphere(V(), V(0.065, 0.065, 0.065), col(1, 1, 1), 8, 5);
      mb.sphere(V(0.012, -0.01, 0.05), V(0.03, 0.03, 0.03), col(0, 0, 0), 6, 4);
    });
    this.eyeR = this.part('EyeR', this.head, V(-0.09, 0.07, 0.215), mb => {
      mb.sphere(V(), V(0.085, 0.085, 0.085), col(1, 1, 1), 8, 5);
      mb.sphere(V(0.02, 0.015, 0.07), V(0.034, 0.034, 0.034), col(0, 0, 0), 6, 4);
    });
    // red beanie with pompom
    const hat = this.part('Hat', this.head, V(0, 0.15, -0.01), mb => {
      mb.sphere(V(), V(0.25, 0.14, 0.25), RED, 9, 5, 0, 0, col(0.8, 0.15, 0.18));
      mb.box(V(0, -0.04, 0), V(0.5, 0.07, 0.5), col(1, 1, 1), col(1, 1, 1));
      mb.sphere(V(0.03, 0.16, -0.02), V(0.07, 0.07, 0.07), col(1, 1, 1), 6, 4);
    });
    hat.quaternion.copy(eulerDeg(-8, 0, 12));

    this.flipL = this.pivot('FlipperL', this.body, V(0.33, 0.15, 0), mb =>
      mb.sphere(V(0.04, -0.2, 0), V(0.06, 0.24, 0.13), NAVY, 7, 5));
    this.flipR = this.pivot('FlipperR', this.body, V(-0.33, 0.15, 0), mb =>
      mb.sphere(V(-0.04, -0.2, 0), V(0.06, 0.24, 0.13), NAVY, 7, 5));
    this.footL = this.part('FootL', this.root, V(0.13, 0.04, 0.08), mb =>
      mb.sphere(V(0, 0, 0.06), V(0.1, 0.04, 0.16), ORANGE, 7, 4));
    this.footR = this.part('FootR', this.root, V(-0.13, 0.04, 0.08), mb =>
      mb.sphere(V(0, 0, 0.06), V(0.1, 0.04, 0.16), ORANGE, 7, 4));
  }

  lateUpdate() {
    const pc = this.pc;
    const dt = Time.deltaTime;
    const st = pc.state;
    const now = Time.time;

    if (st !== PState.Ragdoll) {
      const f = pc.facing.clone(); f.y = 0;
      if (f.lengthSq() > 0.000001) {
        const target = Math.atan2(f.x, f.z) * Rad2Deg;
        this.yaw = moveTowardsAngle(this.yaw, target, 900 * dt);
      }
      // root.rotation is world-space in Unity; the penguin object itself has no rotation unless ragdolling
      this.root.quaternion.copy(eulerDeg(0, this.yaw, 0));
    } else this.root.quaternion.identity();

    const speed01 = clamp01(pc.horizontalSpeed / MOVE_SPEED);
    const ground = st === PState.Ground;
    const air = st === PState.Air || st === PState.Ragdoll;
    const hang = st === PState.Hang;
    const climb = st === PState.Climb;
    const stunned = st === PState.Stunned;
    const vy = pc.velocity.y;

    if (ground) this.waddle += dt * (6 + speed01 * 9) * (speed01 > 0.05 ? 1 : 0.15);
    const s = Math.sin(this.waddle);

    const roll = ground ? s * 11 * Math.max(0.15, speed01) : 0;
    let pitch = ground ? speed01 * 8 : 0;
    if (air) pitch = clamp(-vy * 1.5, -20, 25);
    if (hang || climb) pitch = -10;
    this.flop = moveTowards(this.flop, stunned ? 1 : 0, dt * (stunned ? 8 : 2.5));
    pitch = lerp(pitch, 82, this.flop);
    this.body.quaternion.copy(eulerDeg(pitch, 0, roll));
    const bob = ground ? Math.abs(s) * 0.05 * speed01 : 0;
    this.body.position.set(0, 0.5 + bob - this.flop * 0.25, this.flop * 0.25);

    // squash on landing / stretch in air
    const targetSquash = air ? clamp(1 + Math.abs(vy) * 0.012, 1, 1.18) : 1;
    this.squash = lerp(this.squash, targetSquash, dt * 10);
    this.body.scale.set(1 / Math.sqrt(this.squash), this.squash, 1 / Math.sqrt(this.squash));

    // flippers
    let flapL: number, flapR: number;
    if (hang) { flapL = 165 + Math.sin(now * 18) * 6 * (1 - pc.grip01); flapR = -flapL; }
    else if (climb) { flapL = 120; flapR = -120; }
    else if (air) { const f = Math.sin(now * 28) * 35; flapL = 70 + f; flapR = -70 - f; }
    else if (stunned) { flapL = 80; flapR = -80; }
    else { flapL = 12 + s * 10 * speed01 + Math.sin(now * 2) * 3; flapR = -12 + s * 10 * speed01 - Math.sin(now * 2) * 3; }
    const k = clamp01(dt * 18);
    this.flipL.quaternion.slerp(eulerDeg(0, 0, flapL), k);
    this.flipR.quaternion.slerp(eulerDeg(0, 0, flapR), k);

    // feet
    const step = ground ? s * 0.12 * speed01 : 0;
    this.footL.position.set(0.13, 0.04 + Math.max(0, s) * 0.05 * speed01, 0.08 + step);
    this.footR.position.set(-0.13, 0.04 + Math.max(0, -s) * 0.05 * speed01, 0.08 - step);
    const kick = air ? Math.sin(now * 22) * 25 : 0;
    this.footL.quaternion.copy(eulerDeg(kick, 0, 0));
    this.footR.quaternion.copy(eulerDeg(-kick, 0, 0));

    // head looks around, wobbles
    this.head.quaternion.copy(eulerDeg(Math.sin(now * 1.3) * 4, Math.sin(now * 0.7) * 12, Math.sin(this.waddle * 0.5) * 6));

    // blinking
    this.blinkTimer -= dt;
    if (this.blinkTimer <= 0) { this.blink = 0.14; this.blinkTimer = UnityRandom.range(1.8, 4.5); }
    this.blink -= dt;
    let ey = this.blink > 0 ? 0.1 : 1;
    if (stunned) ey = 0.35 + Math.abs(Math.sin(now * 9)) * 0.5;
    this.eyeL.scale.set(1, ey, 1);
    this.eyeR.scale.set(1, ey, 1);
  }
}
