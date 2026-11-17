import * as THREE from 'three';
import { Physics, RAPIER, type Hit } from '../physics/Physics.ts';
import { Time } from '../core/time.ts';
import { Input } from '../core/Input.ts';
import { Loop } from '../core/loop.ts';
import { refs } from '../core/refs.ts';
import { UnityRandom } from '../core/rng.ts';
import { inverseLerp, moveTowardsV, rotateTowards, dirFromYaw, smoothStep, lerpUnclamped, UP } from '../core/math.ts';
import { MOVE_SPEED, JUMP_V } from '../world/MountainData.ts';
import type { Ledge } from '../world/Ledge.ts';
import { AudioManager } from '../audio/AudioManager.ts';
import { Effects } from '../world/Effects.ts';
import { Taunts } from '../trolls/Taunts.ts';

export const PState = { Ground: 0, Air: 1, Hang: 2, Climb: 3, Stunned: 4, Ragdoll: 5 } as const;
export type PState = (typeof PState)[keyof typeof PState];

export const RADIUS = 0.34, HEIGHT = 1.12;
const SPEED = MOVE_SPEED;
const GRIP_TIME = 3.5;
const GRAVITY = new THREE.Vector3(0, -9.81, 0);

type Fn<A extends unknown[]> = (...a: A) => void;
class Evt<A extends unknown[]> { private l: Fn<A>[] = []; on(f: Fn<A>) { this.l.push(f); } emit(...a: A) { for (const f of this.l) f(...a); } }

/**
 * Rigidbody penguin: camera-relative waddling, jumping, automatic ledge grabbing, hanging, climbing,
 * belly-flop stuns and fall tracking. Origin = feet.
 */
export class PenguinController {
  static instance: PenguinController;
  state: PState = PState.Air;
  readonly object = new THREE.Group();
  body: RAPIER.RigidBody;
  collider: RAPIER.Collider;
  groundLedge: Ledge | null = null;
  groundCollider: RAPIER.Collider | null = null;
  inputLocked = false;
  gravityScale = 1;
  externalAccel = new THREE.Vector3();
  facing = new THREE.Vector3(0, 0, 1);
  horizontalSpeed = 0;
  airTime = 0;

  readonly landed = new Evt<[Ledge | null, number]>();
  readonly jumped = new Evt<[Ledge | null]>();
  readonly fell = new Evt<[number, THREE.Vector3]>();
  readonly grabbed = new Evt<[]>();
  /** sweeper hits etc. (OnCollisionEnter) */
  readonly collided = new Evt<[RAPIER.Collider]>();

  private moveInput = { x: 0, y: 0 };
  private jumpBuffer = 0; private coyote = 0; private noGroundUntil = 0; private grabCooldownUntil = 0; private stunUntil = 0;
  private relVel = new THREE.Vector3();
  private airPeakY = 0;
  private lastVy = 0;
  private squawked = false;
  private stepTimer = 0;
  private hangParent: THREE.Object3D | null = null;
  private hangCollider: RAPIER.Collider | null = null;
  private hangLocal = new THREE.Vector3(); private climbLocal = new THREE.Vector3(); private hangFacingLocal = new THREE.Vector3();
  private hangTime = 0; private climbT = 0;
  private climbFrom = new THREE.Vector3();
  private prevPos = new THREE.Vector3(); private currPos = new THREE.Vector3();
  private touching = new Set<number>();
  /** set by launch(); lets updateMove keep a launch made during the same step (bouncy ledges) */
  private launched = false;

  get locked() { return this.inputLocked || this.state === PState.Ragdoll; }
  get grounded() { return this.state === PState.Ground; }
  get hanging() { return this.state === PState.Hang || this.state === PState.Climb; }
  get grip01() { return this.state === PState.Hang ? Math.min(1, Math.max(0, 1 - this.hangTime / GRIP_TIME)) : 1; }
  get rawMove() { return this.moveInput; }
  /** physics position of the feet */
  get position() { const t = this.body.translation(); return new THREE.Vector3(t.x, t.y, t.z); }
  get velocity() { const v = this.body.linvel(); return new THREE.Vector3(v.x, v.y, v.z); }

  constructor(scene: THREE.Scene) {
    PenguinController.instance = this;
    this.object.name = 'Penguin';
    scene.add(this.object);
    const w = Physics.world;
    this.body = w.createRigidBody(RAPIER.RigidBodyDesc.dynamic().lockRotations().setGravityScale(0).setCcdEnabled(true).setLinearDamping(0));
    const half = (HEIGHT - 2 * RADIUS) / 2;
    this.collider = w.createCollider(
      RAPIER.ColliderDesc.capsule(half, RADIUS).setTranslation(0, HEIGHT * 0.5, 0).setMass(1)
        .setFriction(0).setFrictionCombineRule(RAPIER.CoefficientCombineRule.Min)
        .setRestitution(0).setRestitutionCombineRule(RAPIER.CoefficientCombineRule.Min)
        .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
      this.body);
    Physics.register(this.collider, { penguin: true, object: this.object });
    Physics.setPenguinBody(this.body);
    refs.penguin = this;
    Loop.add(this);
  }

  // ------------------------------------------------------------------ input

  update() {
    const canControl = !this.locked && (refs.game?.isPlaying ?? false);
    let m = { x: 0, y: 0 };
    let jump = false, drop = false;
    if (canControl) {
      const k = Input.isPressed;
      m.x = (k('KeyD') || k('ArrowRight') ? 1 : 0) - (k('KeyA') || k('ArrowLeft') ? 1 : 0);
      m.y = (k('KeyW') || k('ArrowUp') ? 1 : 0) - (k('KeyS') || k('ArrowDown') ? 1 : 0);
      jump = Input.wasPressed('Space');
      drop = Input.wasPressed('ControlLeft') || Input.wasPressed('KeyC');
      const gp = Input.gamepad();
      if (gp) {
        const s = gp.left;
        if (s.x * s.x + s.y * s.y > m.x * m.x + m.y * m.y) m = { x: s.x, y: s.y };
        jump ||= gp.pressed(0);
        drop ||= gp.pressed(1);
      }
    }
    m = refs.chaos(m);
    const len = Math.hypot(m.x, m.y);
    this.moveInput = len > 1 ? { x: m.x / len, y: m.y / len } : m;
    if (jump) this.jumpBuffer = 0.14;
    if (drop && this.state === PState.Hang) this.drop();
  }

  private wishDir() {
    const cam = refs.camera;
    let f = new THREE.Vector3(0, 0, 1);
    if (cam) { cam.getWorldDirection(f); f.y = 0; }
    if (f.lengthSq() < 0.0001) f.set(0, 0, 1);
    f.normalize();
    const r = new THREE.Vector3().crossVectors(UP, f); // Vector3.Cross(Vector3.up, f), as in Unity
    return f.multiplyScalar(this.moveInput.y).addScaledVector(r, this.moveInput.x);
  }

  // ------------------------------------------------------------------ physics

  fixedUpdate() {
    const dt = Time.fixedDeltaTime;
    this.jumpBuffer -= dt;
    this.prevPos.copy(this.currPos);

    switch (this.state) {
      case PState.Hang: this.updateHang(dt); break;
      case PState.Climb: this.updateClimb(dt); break;
      case PState.Ragdoll: {
        const v = this.velocity.addScaledVector(GRAVITY, this.gravityScale * dt);
        this.body.setLinvel(v, true);
        break;
      }
      default: this.updateMove(dt); break;
    }
    this.externalAccel.set(0, 0, 0);

    if (this.body.translation().y < -40 && this.state !== PState.Ragdoll)
      refs.game?.sendToBottom('You fell off the world. Impressive, honestly.');
  }

  /** called by the game after world.step() */
  afterStep() {
    const t = this.body.translation();
    this.currPos.set(t.x, t.y, t.z);
    // OnCollisionEnter replacement
    const now = new Set<number>();
    Physics.world.contactPairsWith(this.collider, other => {
      let touching = false;
      Physics.world.contactPair(this.collider, other, m => { if (m.numContacts() > 0) touching = true; });
      if (!touching) return;
      now.add(other.handle);
      if (!this.touching.has(other.handle)) this.onCollisionEnter(other);
    });
    this.touching = now;
  }

  private updateMove(dt: number) {
    const v = this.velocity;
    let wish = this.wishDir();
    const stunned = this.state === PState.Stunned;
    if (stunned) wish = new THREE.Vector3();

    let hit: Hit | null = null;
    let groundedNow = Time.time >= this.noGroundUntil && (hit = this.checkGround()) != null;
    let ledge: Ledge | null = null;
    let pv = new THREE.Vector3();
    if (groundedNow && hit) {
      this.groundCollider = hit.collider;
      ledge = hit.owner?.ledge ?? null;
      if (ledge && !ledge.solid) { groundedNow = false; ledge = null; }
      else if (ledge) pv = ledge.pointVelocity(this.position);
    }

    const wasAir = this.state === PState.Air;
    if (groundedNow && hit) {
      this.launched = false;
      if (wasAir) this.onLand(ledge, -this.lastVy);
      // a bouncy ledge (or anything else) launched us on landing: keep that velocity, don't stand still
      if (this.launched) return;
      this.groundLedge = ledge;
      this.coyote = 0.11;
      if (this.state === PState.Air) this.state = PState.Ground;
      if (this.state === PState.Stunned && Time.time >= this.stunUntil) this.state = PState.Ground;

      const ice = ledge != null && ledge.isIcy;
      const accel = wish.lengthSq() > 0.0001 ? (ice ? 5 : 38) : (ice ? 0.8 : 15);
      const target = wish.clone().multiplyScalar(SPEED);
      moveTowardsV(this.relVel, target, accel * dt, this.relVel);
      v.copy(this.relVel).add(new THREE.Vector3(pv.x, 0, pv.z)).add(new THREE.Vector3(this.externalAccel.x, 0, this.externalAccel.z).multiplyScalar(0.22));
      v.y = hit.distance > 0.13 ? Math.min(v.y, pv.y - 1.5) : pv.y;
      this.airPeakY = this.body.translation().y;
      this.airTime = 0;
      this.squawked = false;

      // footsteps
      this.horizontalSpeed = this.relVel.length();
      if (this.horizontalSpeed > 0.5) {
        this.stepTimer -= dt * this.horizontalSpeed;
        if (this.stepTimer <= 0) { this.stepTimer = 1.15; AudioManager.play('step', 0.35, UnityRandom.range(0.85, 1.2)); }
      }

      // jump
      if (this.jumpBuffer > 0 && this.state === PState.Ground) {
        this.jumpBuffer = 0;
        v.y = JUMP_V + Math.max(0, pv.y);
        this.noGroundUntil = Time.time + 0.15;
        this.state = PState.Air;
        AudioManager.play('jump', 0.7, UnityRandom.range(0.92, 1.1));
        this.jumped.emit(this.groundLedge);
        this.groundLedge = null;
      }
    } else {
      if (this.state === PState.Ground) {
        // walked off an edge
        this.state = PState.Air;
        this.groundLedge = null;
      }
      this.coyote -= dt;
      if (this.jumpBuffer > 0 && this.coyote > 0 && v.y < 1 && this.state === PState.Air) {
        this.jumpBuffer = 0; this.coyote = 0;
        v.y = JUMP_V;
        this.noGroundUntil = Time.time + 0.15;
        AudioManager.play('jump', 0.7);
        this.jumped.emit(null);
      }

      this.airTime += dt;
      v.addScaledVector(GRAVITY, this.gravityScale * dt).addScaledVector(this.externalAccel, dt);
      let h = new THREE.Vector3(v.x, 0, v.z);
      if (wish.lengthSq() > 0.0001) {
        const target = wish.clone().multiplyScalar(SPEED);
        let nh = moveTowardsV(h, target, 9 * dt);
        if (h.length() > SPEED && nh.length() < h.length() && h.dot(target) > 0) nh = h;
        h = nh;
      }
      v.x = h.x; v.z = h.z;
      v.y = Math.max(v.y, -42);
      this.relVel.copy(h);
      this.horizontalSpeed = h.length();
      this.airPeakY = Math.max(this.airPeakY, this.body.translation().y);

      if (v.y < -13 && !this.squawked) { this.squawked = true; AudioManager.play('squawk', 0.8, UnityRandom.range(0.9, 1.15)); }

      if (this.state === PState.Air && Time.time >= this.grabCooldownUntil && v.y < 3) this.tryGrab(wish);
      if (this.state !== PState.Air && this.state !== PState.Stunned) return; // grabbed
    }

    if (stunned && Time.time >= this.stunUntil && groundedNow) this.state = PState.Ground;

    this.lastVy = v.y;
    this.body.setLinvel(v, true);
    AudioManager.setFallLoop(this.state === PState.Air ? inverseLerp(10, 35, -v.y) : 0);

    // facing
    const face = wish.lengthSq() > 0.0001 ? wish : (this.horizontalSpeed > 1.5 && this.state === PState.Ground ? this.relVel : new THREE.Vector3());
    if (face.lengthSq() > 0.0001 && !stunned) this.facing = rotateTowards(this.facing, face.clone().normalize(), 12 * dt).normalize();
  }

  private checkGround(): Hit | null {
    const origin = this.position.add(new THREE.Vector3(0, RADIUS + 0.1, 0));
    const hit = Physics.sphereCast(origin, RADIUS * 0.92, new THREE.Vector3(0, -1, 0), 0.24);
    if (hit) return hit.normal.y > 0.62 ? hit : null;
    return null;
  }

  private onLand(ledge: Ledge | null, impact: number) {
    const pos = this.position;
    const drop = this.airPeakY - pos.y;
    if (impact > 15) {
      this.state = PState.Stunned;
      this.stunUntil = Time.time + 1.1;
      this.relVel.set(0, 0, 0);
      AudioManager.play('splat', 1);
      refs.shake(0.5);
      Effects.snow(pos, 24);
    } else {
      AudioManager.play('land', Math.min(1, Math.max(0, 0.25 + impact / 12)), UnityRandom.range(0.9, 1.1));
      if (impact > 7) Effects.snow(pos, 8);
    }
    if (drop > 5.5) this.fell.emit(drop, pos);
    this.landed.emit(ledge, impact);
    ledge?.onPlayerLanded(this, impact);
  }

  // ------------------------------------------------------------------ ledge grab

  private tryGrab(wish: THREE.Vector3) {
    const fwd = wish.lengthSq() > 0.0001 ? wish.clone().normalize() : this.facing.clone();
    fwd.y = 0;
    if (fwd.lengthSq() < 0.0001) return;
    fwd.normalize();
    const feet = this.position;

    const ray = (h: number) => Physics.raycast(feet.clone().add(new THREE.Vector3(0, h, 0)).addScaledVector(fwd, -0.05), fwd, RADIUS + 0.5);
    const wall = ray(0.75) ?? ray(1.2);
    if (!wall || Math.abs(wall.normal.y) > 0.35) return;
    if (wall.owner?.sweeper) return;
    const n = new THREE.Vector3(wall.normal.x, 0, wall.normal.z).normalize();

    const probe = new THREE.Vector3(wall.point.x, feet.y + 2.05, wall.point.z).addScaledVector(n, -0.22);
    const top = Physics.raycast(probe, new THREE.Vector3(0, -1, 0), 1.5);
    if (!top) return;
    if (top.normal.y < 0.85) return;
    if (top.collider !== wall.collider && (top.owner?.ledge ?? null) !== (wall.owner?.ledge ?? null)) return;
    const ledge = top.owner?.ledge ?? null;
    if (ledge && !ledge.solid) return;

    const standPoint = top.point.clone().addScaledVector(n, -0.45).add(new THREE.Vector3(0, 0.04, 0));
    if (Physics.checkCapsule(standPoint.clone().add(new THREE.Vector3(0, RADIUS + 0.06, 0)), standPoint.clone().add(new THREE.Vector3(0, HEIGHT - RADIUS, 0)), RADIUS * 0.85))
      return;

    // fall check counts grabbing as a landing
    const drop = this.airPeakY - feet.y;
    if (drop > 5.5) this.fell.emit(drop, feet);

    const hangPos = new THREE.Vector3(wall.point.x, top.point.y - 1.22, wall.point.z).addScaledVector(n, RADIUS + 0.05);
    this.hangParent = top.owner?.object ?? WORLD_ANCHOR;
    this.hangCollider = top.collider;
    this.hangParent.updateMatrixWorld(true);
    this.hangLocal = this.hangParent.worldToLocal(hangPos.clone());
    this.climbLocal = this.hangParent.worldToLocal(standPoint.clone());
    this.hangFacingLocal = n.clone().negate().transformDirection(this.hangParent.matrixWorld.clone().invert());
    this.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.body.setBodyType(RAPIER.RigidBodyType.KinematicPositionBased, true);
    this.body.setTranslation(hangPos, true);
    this.state = PState.Hang;
    this.hangTime = 0;
    this.groundLedge = null;
    this.facing = n.clone().negate();
    AudioManager.play('grab', 0.8);
    AudioManager.setFallLoop(0);
    this.grabbed.emit();
  }

  private updateHang(dt: number) {
    if (!this.hangParent || !visibleInHierarchy(this.hangParent) || !this.isParentSolid()) { this.drop(); return; }
    this.body.setNextKinematicTranslation(this.hangParent.localToWorld(this.hangLocal.clone()));
    this.facing = this.hangFacingLocal.clone().transformDirection(this.hangParent.matrixWorld);
    this.hangTime += dt;
    if (this.hangTime > GRIP_TIME) {
      refs.ui?.taunt(Taunts.pick(Taunts.GripLost));
      this.drop();
      return;
    }
    if (this.locked) return;
    if (this.jumpBuffer > 0 || this.moveInput.y > 0.5) {
      this.jumpBuffer = 0;
      this.state = PState.Climb;
      this.climbT = 0;
      this.climbFrom.copy(this.hangLocal);
      AudioManager.play('climb', 0.7);
    } else if (this.moveInput.y < -0.5) this.drop();
  }

  private isParentSolid() {
    const l = this.hangCollider ? Physics.ownerOf(this.hangCollider)?.ledge : undefined;
    if (l && !l.solid) return false;
    return this.hangCollider == null || this.hangCollider.isEnabled();
  }

  private updateClimb(dt: number) {
    if (!this.hangParent || !this.isParentSolid()) { this.drop(); return; }
    this.climbT += dt / 0.4;
    const up = new THREE.Vector3(this.climbFrom.x, this.climbLocal.y, this.climbFrom.z);
    const local = this.climbT < 0.55
      ? new THREE.Vector3().lerpVectors(this.climbFrom, up, smoothStep(0, 1, this.climbT / 0.55))
      : new THREE.Vector3().lerpVectors(up, this.climbLocal, smoothStep(0, 1, (this.climbT - 0.55) / 0.45));
    this.body.setNextKinematicTranslation(this.hangParent.localToWorld(local));
    if (this.climbT >= 1) {
      this.body.setBodyType(RAPIER.RigidBodyType.Dynamic, true);
      this.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      this.relVel.set(0, 0, 0);
      this.airPeakY = this.body.translation().y;
      this.lastVy = 0;
      this.state = PState.Air;
      this.noGroundUntil = 0;
    }
  }

  drop() {
    if (this.state !== PState.Hang && this.state !== PState.Climb) return;
    this.body.setBodyType(RAPIER.RigidBodyType.Dynamic, true);
    const back = this.facing.clone().negate(); back.y = 0;
    this.body.setLinvel(back.normalize().multiplyScalar(1.2), true);
    this.state = PState.Air;
    this.grabCooldownUntil = Time.time + 0.5;
  }

  // ------------------------------------------------------------------ external control

  /** Throws the penguin (traps, bounce pads, sweepers). */
  launch(velocity: THREE.Vector3, noGround: number) {
    if (this.state === PState.Ragdoll) return;
    this.body.setBodyType(RAPIER.RigidBodyType.Dynamic, true);
    if (this.state === PState.Hang || this.state === PState.Climb || this.state === PState.Ground || this.state === PState.Stunned)
      this.state = PState.Air;
    this.body.setLinvel(velocity, true);
    this.launched = true;
    this.relVel.set(velocity.x, 0, velocity.z);
    this.lastVy = velocity.y;
    this.noGroundUntil = Time.time + noGround;
    this.groundLedge = null;
  }

  teleport(pos: THREE.Vector3, yaw: number) {
    this.body.setBodyType(RAPIER.RigidBodyType.Dynamic, true);
    this.body.setTranslation(pos, true);
    this.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this.prevPos.copy(pos); this.currPos.copy(pos);
    this.object.position.copy(pos);
    this.relVel.set(0, 0, 0);
    this.airPeakY = pos.y;
    this.lastVy = 0;
    this.state = PState.Air;
    this.groundLedge = null;
    this.gravityScale = 1;
    this.facing = dirFromYaw(yaw);
    this.body.lockRotations(true, true);
    this.body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
  }

  stun(seconds: number) {
    if (this.state === PState.Ragdoll) return;
    if (this.state === PState.Hang || this.state === PState.Climb) this.drop();
    this.state = PState.Stunned;
    this.stunUntil = Time.time + seconds;
  }

  ragdoll(velocity: THREE.Vector3, torque: THREE.Vector3) {
    this.body.setBodyType(RAPIER.RigidBodyType.Dynamic, true);
    this.state = PState.Ragdoll;
    this.body.lockRotations(false, true);
    this.body.setLinvel(velocity, true);
    this.body.setAngvel(torque, true);
  }

  private onCollisionEnter(other: RAPIER.Collider) {
    this.collided.emit(other);
    const owner = Physics.ownerOf(other);
    if (owner?.sweeper && this.state !== PState.Ragdoll) {
      const ledge = owner.ledge!;
      const armPos = owner.object!.getWorldPosition(new THREE.Vector3());
      const away = this.position.sub(armPos); away.y = 0;
      // GetPointVelocity of the spinning arm
      const sp = (ledge.index % 2 === 0 ? 1 : -1) * (85 + ledge.stage * 3) * Math.PI / 180;
      const r = this.position.sub(armPos);
      const contactVel = new THREE.Vector3(0, sp, 0).cross(r); contactVel.y = 0;
      const push = away.normalize().multiplyScalar(4).addScaledVector(contactVel.lengthSq() > 0 ? contactVel.normalize() : contactVel, 6).add(new THREE.Vector3(0, 4.5, 0));
      this.launch(push, 0.3);
      AudioManager.play('bonk', 0.9);
      AudioManager.play('squawk', 0.6, 1.2);
      refs.traps?.registerExternalTrap('sweeper');
    }
  }

  /** Rigidbody interpolation for rendering. */
  lateUpdate() {
    const a = refs.alpha;
    if (this.state === PState.Hang || this.state === PState.Climb) this.object.position.copy(this.currPos);
    else this.object.position.set(lerpUnclamped(this.prevPos.x, this.currPos.x, a), lerpUnclamped(this.prevPos.y, this.currPos.y, a), lerpUnclamped(this.prevPos.z, this.currPos.z, a));
    const q = this.body.rotation();
    this.object.quaternion.set(q.x, q.y, q.z, q.w);
  }
}

const WORLD_ANCHOR = new THREE.Object3D();

function visibleInHierarchy(o: THREE.Object3D) {
  for (let p: THREE.Object3D | null = o; p; p = p.parent) if (!p.visible) return false;
  return true;
}
