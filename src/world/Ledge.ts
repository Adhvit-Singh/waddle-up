import * as THREE from 'three';
import { DotNetRandom, UnityRandom } from '../core/rng.ts';
import { LedgeKind } from '../core/StageData.ts';
import { col, lerpColor, mulRGB, clamp01, repeat, smoothStep, eulerDeg } from '../core/math.ts';
import { Time } from '../core/time.ts';
import { Scheduler, type Co } from '../core/coroutines.ts';
import { Loop } from '../core/loop.ts';
import { refs } from '../core/refs.ts';
import { Physics, RAPIER } from '../physics/Physics.ts';
import { MeshBuilder, meshObject, Mats } from './MeshKit.ts';
import { AudioManager } from '../audio/AudioManager.ts';
import { Effects } from './Effects.ts';
import type { LedgeSpec } from './MountainData.ts';

const iceTintMat = () => Mats.vertexColorInstance(col(0.7, 0.9, 1.25), col(0.05, 0.12, 0.2));
let sharedIceMat: THREE.Material | null = null;

/**
 * One climbable platform on the spiral path. The object origin is the CENTER OF THE TOP SURFACE.
 * Local +Z = path tangent (direction of travel), local +X = outward from the mountain.
 */
export class Ledge {
  index: number;
  stage: number;
  kind: LedgeKind;
  size: THREE.Vector3;
  velocity = new THREE.Vector3();
  angularVelocity = new THREE.Vector3();
  conveyor = new THREE.Vector3();
  solid = true;
  /** tier root that this ledge lives under */
  readonly root: THREE.Object3D;
  readonly object = new THREE.Group();

  private visual: THREE.Mesh;
  private baseMat: THREE.Material;
  private body: RAPIER.RigidBody;
  private box: RAPIER.Collider;
  private postCol: RAPIER.Collider | null = null;
  private basePos: THREE.Vector3;
  private baseRot: THREE.Quaternion;
  private phase: number;
  private icyUntil = 0;
  private standTimer = 0;
  private crumbling = false;
  private sweeperArm: THREE.Object3D | null = null;
  private sweeperBody: RAPIER.RigidBody | null = null;
  sweeperCollider: RAPIER.Collider | null = null;
  private chevrons: THREE.Object3D[] | null = null;
  private tierActive = true;
  private ghostUntil = 0;
  private ghostMat: THREE.MeshLambertMaterial | null = null;
  private tilting = false;

  get isIcy() { return this.kind === LedgeKind.Ice || Time.time < this.icyUntil; }
  get isDynamic() { return this.kind === LedgeKind.Moving || this.kind === LedgeKind.Rotating; }
  get position() { return this.object.getWorldPosition(new THREE.Vector3()); }
  get forward() { return new THREE.Vector3(0, 0, 1).applyQuaternion(this.object.getWorldQuaternion(new THREE.Quaternion())); }
  get right() { return new THREE.Vector3(1, 0, 0).applyQuaternion(this.object.getWorldQuaternion(new THREE.Quaternion())); }
  get colliders(): RAPIER.Collider[] { return [this.box, this.postCol, this.sweeperCollider].filter((c): c is RAPIER.Collider => !!c); }

  pointVelocity(worldPoint: THREE.Vector3) {
    const r = worldPoint.clone().sub(this.position);
    return this.velocity.clone().add(new THREE.Vector3().crossVectors(this.angularVelocity, r)).add(this.conveyor);
  }

  constructor(spec: LedgeSpec, root: THREE.Object3D) {
    const { index: idx, stage, kind: k, size: sz, rock, top, seed } = spec;
    this.index = idx; this.stage = stage; this.kind = k; this.size = sz.clone();
    this.root = root;
    this.object.name = `Ledge_${idx}`;
    this.object.position.copy(spec.pos);
    this.object.quaternion.copy(spec.rot);
    root.add(this.object);
    this.basePos = spec.pos.clone(); this.baseRot = spec.rot.clone();
    const rng = new DotNetRandom(seed);
    this.phase = rng.nextDouble() * 10;

    let side = mulRGB(rock, 1.1), cap = lerpColor(top, rock, 0.18);
    switch (k) {
      case LedgeKind.Ice: side = col(0.55, 0.78, 0.92); cap = col(0.82, 0.95, 1); break;
      case LedgeKind.Crumble: side = col(0.55, 0.40, 0.28); cap = col(0.78, 0.64, 0.48); break;
      case LedgeKind.Bouncy: side = col(0.85, 0.30, 0.62); cap = col(1, 0.55, 0.85); break;
      case LedgeKind.Blink: side = col(0.45, 0.40, 0.75); cap = col(0.75, 0.70, 1); break;
      case LedgeKind.Conveyor: side = col(0.25, 0.27, 0.30); cap = col(0.36, 0.38, 0.42); break;
      case LedgeKind.Moving: side = lerpColor(rock, col(0.9, 0.7, 0.3), 0.35); break;
      case LedgeKind.Rotating: side = lerpColor(rock, col(0.3, 0.8, 0.6), 0.35); break;
      case LedgeKind.Rest: cap = lerpColor(top, col(1, 1, 1), 0.5); break;
    }
    const vary = (rng.nextDouble() - 0.5) * 0.12;
    side = col(clamp01(side.r + vary), clamp01(side.g + vary), clamp01(side.b + vary));

    const mb = new MeshBuilder();
    mb.box(new THREE.Vector3(0, -sz.y * 0.5, 0), sz, side, cap);
    if (k === LedgeKind.Normal || k === LedgeKind.Rest || k === LedgeKind.Wall) {
      mb.box(new THREE.Vector3(0, -0.08, 0), new THREE.Vector3(sz.x + 0.12, 0.18, sz.z + 0.12), mulRGB(cap, 0.96), cap);
      for (let i = 0; i < 2; i++) {
        const z = (rng.nextDouble() - 0.5) * sz.z * 0.8;
        const y = -0.4 - rng.nextDouble() * Math.max(0.1, sz.y - 0.8);
        mb.sphere(new THREE.Vector3(sz.x * 0.5, y, z), new THREE.Vector3(0.25, 0.2, 0.3), mulRGB(side, 0.85), 5, 3, 0.25, seed + i);
      }
    }
    if (k === LedgeKind.Bouncy) mb.sphere(new THREE.Vector3(0, 0.02, 0), new THREE.Vector3(sz.x * 0.42, 0.18, sz.z * 0.42), cap, 8, 4);

    this.visual = meshObject('Visual', mb.build(), this.object);
    this.baseMat = this.visual.material as THREE.Material;

    // ---- physics
    const world = Physics.world;
    const dynamic = k === LedgeKind.Moving || k === LedgeKind.Rotating;
    const wp = this.position, wq = this.object.getWorldQuaternion(new THREE.Quaternion());
    const bd = (dynamic ? RAPIER.RigidBodyDesc.kinematicPositionBased() : RAPIER.RigidBodyDesc.fixed())
      .setTranslation(wp.x, wp.y, wp.z).setRotation({ x: wq.x, y: wq.y, z: wq.z, w: wq.w });
    this.body = world.createRigidBody(bd);
    this.box = world.createCollider(RAPIER.ColliderDesc.cuboid(sz.x / 2, sz.y / 2, sz.z / 2).setTranslation(0, -sz.y / 2, 0).setFriction(0.6), this.body);
    Physics.register(this.box, { ledge: this, object: this.object });

    if (k === LedgeKind.Conveyor) {
      this.conveyor = this.forward.multiplyScalar(-2.4);
      this.chevrons = [];
      for (let i = 0; i < 4; i++) {
        const cb = new MeshBuilder();
        cb.box(new THREE.Vector3(), new THREE.Vector3(sz.x * 0.8, 0.04, 0.18), col(1, 0.8, 0.1), col(1, 0.85, 0.2));
        const ch = meshObject('Chevron', cb.build(), this.object, false);
        ch.position.set(0, 0.025, 0);
        this.chevrons.push(ch);
      }
    }
    if (k === LedgeKind.Sweeper) {
      const post = new MeshBuilder();
      post.box(new THREE.Vector3(0, 0.45, 0), new THREE.Vector3(0.3, 0.9, 0.3), col(0.3, 0.3, 0.35), col(0.9, 0.2, 0.2));
      meshObject('Post', post.build(), this.object);
      this.postCol = world.createCollider(RAPIER.ColliderDesc.cuboid(0.15, 0.45, 0.15).setTranslation(0, 0.45, 0), this.body);
      Physics.register(this.postCol, { ledge: this, object: this.object });

      const arm = new THREE.Group();
      arm.name = 'SweeperArm';
      arm.position.set(0, 0.55, 0);
      this.object.add(arm);
      const am = new MeshBuilder();
      const len = Math.max(sz.x, sz.z) * 0.62;
      am.box(new THREE.Vector3(0, 0, len * 0.5), new THREE.Vector3(0.22, 0.22, len), col(0.95, 0.25, 0.2), col(1, 0.9, 0.9));
      am.box(new THREE.Vector3(0, 0, -len * 0.5), new THREE.Vector3(0.22, 0.22, len), col(0.95, 0.85, 0.2), col(1, 1, 0.8));
      meshObject('ArmMesh', am.build(), arm);
      const ap = arm.getWorldPosition(new THREE.Vector3());
      this.sweeperBody = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(ap.x, ap.y, ap.z).setRotation({ x: wq.x, y: wq.y, z: wq.z, w: wq.w }));
      this.sweeperCollider = world.createCollider(RAPIER.ColliderDesc.cuboid(0.11, 0.11, len), this.sweeperBody);
      Physics.register(this.sweeperCollider, { ledge: this, sweeper: true, object: arm });
      this.sweeperArm = arm;
    }

    Loop.add(this);
  }

  // ------------------------------------------------------------------ simulation

  fixedUpdate() {
    if (!this.tierActive) return;
    const t = Time.time + this.phase;
    const dt = Time.fixedDeltaTime;
    if (this.kind === LedgeKind.Moving) {
      // alternate between vertical bobbing and outward sliding, by index
      const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.object.quaternion);
      const offset = (this.index % 2 === 0)
        ? new THREE.Vector3(0, Math.sin(t * 1.1) * 0.6, 0)
        : right.multiplyScalar((Math.sin(t * 0.9) + 1) * 0.75);
      const target = this.root.localToWorld(this.basePos.clone()).add(offset);
      const cur = this.body.translation();
      this.velocity.set((target.x - cur.x) / dt, (target.y - cur.y) / dt, (target.z - cur.z) / dt);
      this.body.setNextKinematicTranslation(target);
      this.object.position.copy(this.root.worldToLocal(target.clone()));
    } else if (this.kind === LedgeKind.Rotating) {
      const speed = (this.index % 2 === 0 ? 1 : -1) * 42;
      this.angularVelocity.set(0, speed * Math.PI / 180, 0);
      const r = this.body.rotation();
      const q = eulerDeg(0, speed * dt, 0).multiply(new THREE.Quaternion(r.x, r.y, r.z, r.w));
      this.body.setNextKinematicRotation(q);
      this.object.quaternion.copy(q); // tier roots never rotate
    }
    if (this.sweeperBody && this.sweeperArm) {
      const sp = (this.index % 2 === 0 ? 1 : -1) * (85 + this.stage * 3);
      this.sweeperArm.rotateY(sp * dt * Math.PI / 180);
      const wp = this.sweeperArm.getWorldPosition(new THREE.Vector3());
      const wq = this.sweeperArm.getWorldQuaternion(new THREE.Quaternion());
      this.sweeperBody.setNextKinematicTranslation(wp);
      this.sweeperBody.setNextKinematicRotation(wq);
    }
  }

  update() {
    if (!this.tierActive) return;
    const standing = refs.penguin != null && refs.penguin.groundLedge === this;

    if (this.kind === LedgeKind.Crumble && this.solid && !this.crumbling) {
      this.standTimer = standing ? this.standTimer + Time.deltaTime : Math.max(0, this.standTimer - Time.deltaTime);
      if (this.standTimer > 0.55) this.crumble(0.45, 3.2);
    }
    if (this.kind === LedgeKind.Blink && !this.crumbling) {
      const cycle = 4.2;
      const c = repeat(Time.time + this.phase, cycle);
      const on = c < 2.8;
      const warn = c > 2.2 && c < 2.8;
      this.setSolid(on);
      if (on) this.visual.visible = !warn || repeat(Time.time * 12, 1) > 0.4;
    }
    if (this.chevrons) {
      const n = this.chevrons.length;
      for (let i = 0; i < n; i++) {
        const z = repeat(Time.time * 2.4 * -1 + i * this.size.z / n, this.size.z) - this.size.z * 0.5;
        this.chevrons[i].position.set(0, 0.025, z);
      }
    }
    // fall-through trap: intangible but still visible (a faint shimmer is the only hint)
    if (this.ghostUntil > 0) {
      const pc = refs.penguin;
      const passed = pc != null && pc.position.y < this.position.y - 2.5;
      if (Time.time >= this.ghostUntil || passed) { this.ghostUntil = 0; if (this.solid) this.box.setEnabled(this.tierActive); }
    }
    if (this.ghostUntil > 0) {
      if (!this.ghostMat) { this.ghostMat = Mats.vertexColorInstance(col(1, 1, 1)); this.ghostMat.transparent = true; }
      this.ghostMat.opacity = 0.82 + Math.sin(Time.time * 9) * 0.12;
      if (this.visual.material !== this.ghostMat) this.visual.material = this.ghostMat;
      return;
    }
    // ice tint
    const tempIce = Time.time < this.icyUntil && this.kind !== LedgeKind.Ice;
    const want = tempIce ? (sharedIceMat ??= iceTintMat()) : this.baseMat;
    if (this.visual.material !== want) this.visual.material = want;
  }

  private setSolid(on: boolean) {
    if (this.solid === on) return;
    this.solid = on;
    this.box.setEnabled(on && this.tierActive);
    this.visual.visible = on;
    if (this.chevrons) for (const c of this.chevrons) c.visible = on;
  }

  /** called by MountainGenerator when its tier is shown/hidden */
  setTierActive(on: boolean) {
    this.tierActive = on;
    for (const c of this.colliders) c.setEnabled(on && (c !== this.box || this.solid));
  }

  /** teleport the physics bodies to wherever the object currently is (after the tier root moved) */
  syncBodies() {
    const wp = this.position, wq = this.object.getWorldQuaternion(new THREE.Quaternion());
    this.body.setTranslation(wp, true);
    this.body.setRotation({ x: wq.x, y: wq.y, z: wq.z, w: wq.w }, true);
    if (this.sweeperBody && this.sweeperArm) {
      this.sweeperBody.setTranslation(this.sweeperArm.getWorldPosition(new THREE.Vector3()), true);
      const aq = this.sweeperArm.getWorldQuaternion(new THREE.Quaternion());
      this.sweeperBody.setRotation({ x: aq.x, y: aq.y, z: aq.z, w: aq.w }, true);
    }
  }

  // ------------------------------------------------------------------ trap hooks

  onPlayerLanded(p: { launch(v: THREE.Vector3, noGround: number): void }, _impactSpeed: number) {
    if (this.kind === LedgeKind.Bouncy) {
      const r = UnityRandom.insideUnitSphere();
      const rnd = new THREE.Vector3(r.x, 0, r.z);
      p.launch(new THREE.Vector3(0, UnityRandom.range(10.5, 12.5), 0).addScaledVector(rnd, 2.2).addScaledVector(this.forward, 1.2), 0.25);
      AudioManager.play('bounce', 0.9);
      Scheduler.start(this, this.squash());
    }
  }

  private *squash(): Co {
    let t = 0;
    while (t < 0.35) {
      t += Time.deltaTime;
      const s = 1 - Math.sin(t / 0.35 * Math.PI) * 0.35;
      this.visual.scale.set(1 / Math.sqrt(s), s, 1 / Math.sqrt(s));
      yield null;
    }
    this.visual.scale.set(1, 1, 1);
  }

  makeIcy(duration: number) { this.icyUntil = Time.time + duration; }

  /** Fall-through trap: the ledge stays visible but you pass straight through it (until you're below it, or timeout). */
  ghost(seconds: number) {
    if (this.isDynamic || !this.solid) return;
    this.ghostUntil = Time.time + seconds;
    this.box.setEnabled(false);
  }

  /** Tilt trap: wobble warning, then tip the outer edge down and drift the penguin outward, then come back. */
  tilt(deg: number, hold: number) {
    if (this.isDynamic || this.tilting || this.crumbling) return;
    Scheduler.start(this, this.tiltRoutine(deg, hold));
  }

  private *tiltRoutine(deg: number, hold: number): Co {
    this.tilting = true;
    AudioManager.playAt('crumble', this.position, 0.5);
    let t = 0;
    while (t < 0.4) { t += Time.deltaTime; this.visual.position.set(0, 0, Math.sin(t * 70) * 0.04); yield null; }
    this.visual.position.set(0, 0, 0);
    const outward = this.right; outward.y = 0; outward.normalize();
    const pose = (a: number) => {
      // rotate about the inner top edge (local x = -size.x/2) around the path direction, outer edge going down
      const q = this.baseRot.clone().multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -a * Math.PI / 180));
      const edge = new THREE.Vector3(-this.size.x / 2, 0, 0);
      const off = edge.clone().applyQuaternion(this.baseRot).sub(edge.clone().applyQuaternion(q));
      this.object.quaternion.copy(q);
      this.object.position.copy(this.basePos).add(off);
      this.syncBodies();
    };
    t = 0;
    while (t < 0.25) { t += Time.deltaTime; pose(deg * Math.min(1, t / 0.25)); yield null; }
    const baseConv = this.conveyor.clone();
    this.conveyor.copy(baseConv).addScaledVector(outward, 3);
    yield hold;
    this.conveyor.copy(baseConv);
    t = 0;
    while (t < 0.5) { t += Time.deltaTime; pose(deg * (1 - Math.min(1, t / 0.5))); yield null; }
    this.object.position.copy(this.basePos); this.object.quaternion.copy(this.baseRot); this.syncBodies();
    this.tilting = false;
  }

  get canCrumble() { return this.solid && !this.crumbling && !this.isDynamic && this.kind !== LedgeKind.Blink; }

  crumble(shakeTime: number, respawn: number) {
    if (!this.canCrumble) return;
    Scheduler.start(this, this.crumbleRoutine(shakeTime, respawn));
  }

  private *crumbleRoutine(shakeTime: number, respawn: number): Co {
    this.crumbling = true;
    AudioManager.playAt('crumble', this.position, 0.8);
    let t = 0;
    while (t < shakeTime) {
      t += Time.deltaTime;
      const r = UnityRandom.insideUnitSphere();
      this.visual.position.set(r.x * 0.07, r.y * 0.07, r.z * 0.07);
      yield null;
    }
    this.box.setEnabled(false); this.solid = false;
    Effects.dust(this.position, 18, col(0.75, 0.7, 0.65));
    t = 0;
    while (t < 1) {
      t += Time.deltaTime;
      this.visual.position.set(0, -(t * t * 9), 0);
      this.visual.quaternion.copy(eulerDeg(t * 25, 0, t * 15));
      yield null;
    }
    this.visual.visible = false;
    yield respawn;
    this.visual.position.set(0, 0, 0); this.visual.quaternion.identity();
    this.visual.visible = true;
    this.visual.scale.setScalar(0.01);
    t = 0;
    while (t < 0.3) { t += Time.deltaTime; this.visual.scale.setScalar(smoothStep(0.01, 1, t / 0.3)); yield null; }
    this.visual.scale.set(1, 1, 1);
    this.box.setEnabled(this.tierActive); this.solid = true;
    this.crumbling = false; this.standTimer = 0;
  }

  /** "Shy ledge": scoot away by offset, hold, then come back. */
  scoot(worldOffset: THREE.Vector3, hold: number) {
    if (this.isDynamic || this.crumbling) return;
    Scheduler.start(this, this.scootRoutine(worldOffset, hold));
  }

  private *scootRoutine(off: THREE.Vector3, hold: number): Co {
    const a = this.basePos.clone(), b = this.basePos.clone().add(off);
    let t = 0;
    while (t < 0.22) { t += Time.deltaTime; this.object.position.lerpVectors(a, b, clamp01(t / 0.22)); this.syncBodies(); yield null; }
    yield hold;
    t = 0;
    while (t < 0.6) { t += Time.deltaTime; this.object.position.lerpVectors(b, a, clamp01(t / 0.6)); this.syncBodies(); yield null; }
    this.object.position.copy(a); this.syncBodies();
  }

  resetState() {
    Scheduler.stopAll(this);
    this.object.position.copy(this.basePos); this.object.quaternion.copy(this.baseRot);
    if (this.sweeperArm) this.sweeperArm.quaternion.identity();
    this.syncBodies();
    this.visual.position.set(0, 0, 0); this.visual.quaternion.identity(); this.visual.scale.set(1, 1, 1);
    this.crumbling = false; this.standTimer = 0; this.icyUntil = 0; this.ghostUntil = 0; this.tilting = false;
    if (this.kind === LedgeKind.Conveyor) this.conveyor = this.forward.multiplyScalar(-2.4); else this.conveyor.set(0, 0, 0);
    this.solid = false; this.setSolid(true);
    this.visual.visible = true;
  }
}
