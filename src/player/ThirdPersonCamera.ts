import * as THREE from 'three';
import { Time } from '../core/time.ts';
import { Input } from '../core/Input.ts';
import { Loop } from '../core/loop.ts';
import { refs } from '../core/refs.ts';
import { UnityRandom } from '../core/rng.ts';
import { clamp, lerp, inverseLerp, moveTowards, moveTowardsAngle, sign, eulerDeg, lookRotation, yawOf, Rad2Deg } from '../core/math.ts';
import { Physics } from '../physics/Physics.ts';
import { AudioManager } from '../audio/AudioManager.ts';
import { GameSettings } from '../core/GameSettings.ts';
import { PenguinController, PState } from './PenguinController.ts';
import type { MountainGenerator } from '../world/MountainGenerator.ts';
import { TrapEffects } from '../trolls/TrapEffects.ts';

export const CamMode = { Follow: 0, MenuOrbit: 1, Cutscene: 2 } as const;
export type CamMode = (typeof CamMode)[keyof typeof CamMode];

/** Orbit third-person camera with collision, shake, troll flips, a menu orbit and cutscene control. */
export class ThirdPersonCamera {
  static instance: ThirdPersonCamera;
  mode: CamMode = CamMode.MenuOrbit;
  cam: THREE.PerspectiveCamera;
  target: THREE.Object3D | null = null;
  yaw = 0; pitch = 18; distance = 6.5;
  private yawExtra = 0;
  private shakeAmt = 0;
  private followPos = new THREE.Vector3();
  private currentDist: number;
  private cutPos = new THREE.Vector3(); private cutLook = new THREE.Vector3();
  private cutLerp = 2;
  private menuAngle = 0;
  private mg: MountainGenerator;
  /** Unity-style camera rotation (+Z forward). three cameras look down −Z, so we keep our own. */
  private rot = new THREE.Quaternion();
  private trollRoll = 0;

  constructor(cam: THREE.PerspectiveCamera, mg: MountainGenerator) {
    ThirdPersonCamera.instance = this;
    this.cam = cam; this.mg = mg;
    this.currentDist = this.distance;
    this.rot.copy(lookRotation(new THREE.Vector3(0, -0.2, 1)));
    refs.shake = a => this.shake(a);
    Loop.add(this);
  }

  get position() { return this.cam.position; }

  snapBehindTarget() {
    if (!this.target) return;
    const f = PenguinController.instance ? PenguinController.instance.facing : new THREE.Vector3(0, 0, 1);
    this.yaw = yawOf(f);
    this.pitch = 18;
    this.followPos.copy(this.target.position).add(new THREE.Vector3(0, 1, 0));
    this.place(1, true);
    this.apply();
  }

  flip180() { this.yawExtra += 180; AudioManager.play('whoosh', 0.6); }
  shake(amount: number) { if (GameSettings.cameraShake) this.shakeAmt = Math.max(this.shakeAmt, amount); }

  setCutscene(pos: THREE.Vector3, look: THREE.Vector3, lerpSpeed = 2) {
    this.mode = CamMode.Cutscene;
    this.cutPos.copy(pos); this.cutLook.copy(look); this.cutLerp = lerpSpeed;
  }

  lateUpdate() {
    const dt = Time.unscaledDeltaTime;
    switch (this.mode) {
      case CamMode.Follow: this.updateFollow(dt); break;
      case CamMode.MenuOrbit: this.updateMenu(dt); break;
      case CamMode.Cutscene: {
        this.cam.position.lerp(this.cutPos, 1 - Math.exp(-this.cutLerp * dt));
        const want = lookRotation(this.cutLook.clone().sub(this.cam.position));
        this.rot.slerp(want, 1 - Math.exp(-this.cutLerp * 1.5 * dt));
        break;
      }
    }
    if (this.shakeAmt > 0) {
      const r = UnityRandom.insideUnitSphere();
      this.cam.position.add(new THREE.Vector3(r.x, r.y, r.z).multiplyScalar(this.shakeAmt * 0.35));
      this.shakeAmt = moveTowards(this.shakeAmt, 0, dt * 1.2);
    }
    this.apply();
  }

  /** turn the Unity-style rotation (+Z forward) into the three camera orientation (−Z forward) */
  private apply() {
    // camera-troll trap: roll the view upside down (smoothly in and out)
    const troll = this.mode === CamMode.Follow ? TrapEffects.activeCameraTroll : null;
    this.trollRoll = lerp(this.trollRoll, troll?.kind === 'roll' ? 180 : 0, 1 - Math.exp(-8 * Time.unscaledDeltaTime));
    const r = this.trollRoll > 0.5 ? this.rot.clone().multiply(eulerDeg(0, 0, this.trollRoll)) : this.rot;
    const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(r);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(r);
    this.cam.up.copy(up);
    this.cam.lookAt(this.cam.position.clone().add(fwd));
    this.cam.updateMatrixWorld();
  }

  private updateMenu(dt: number) {
    this.menuAngle += dt * 3.5;
    const a = this.menuAngle * Math.PI / 180;
    const r = this.mg.tiers[0].rBase + 70;
    const pos = new THREE.Vector3(Math.cos(a) * r, 38, Math.sin(a) * r);
    this.cam.position.lerp(pos, 1 - Math.exp(-1.5 * dt));
    const look = new THREE.Vector3(0, 45, 0);
    this.rot.slerp(lookRotation(look.sub(this.cam.position)), 1 - Math.exp(-2 * dt));
    this.setFov(lerp(this.cam.fov, 55, dt * 2));
  }

  private updateFollow(dt: number) {
    if (!this.target) return;
    const playing = refs.game?.isPlaying ?? false;
    if (playing) {
      const d = Input.mouseDelta;
      const dx = d.x * 0.09 * GameSettings.sensitivity, dy = -d.y * 0.09 * GameSettings.sensitivity; // browser y is down
      this.yaw += dx;
      this.pitch += GameSettings.invertY ? dy : -dy;
      const scroll = Input.scrollY;
      if (Math.abs(scroll) > 0.01) this.distance = clamp(this.distance - sign(scroll) * 0.6, 3, 11);
      const gp = Input.gamepad();
      if (gp) {
        this.yaw += gp.right.x * 160 * dt * GameSettings.sensitivity;
        this.pitch -= gp.right.y * 110 * dt * GameSettings.sensitivity;
      }
    }
    this.pitch = clamp(this.pitch, -30, 72);
    this.swingOutIfSqueezed(dt);
    const flipStep = sign(this.yawExtra) * Math.min(Math.abs(this.yawExtra), 600 * dt);
    this.yaw += flipStep; this.yawExtra -= flipStep;
    this.place(dt, false);
  }

  /**
   * Round 3: when rock behind the penguin would pull the camera in tight (view blocked), swing the camera around toward
   * "outward from the mountain" instead, so you keep a clear view. The normal collision pull-in stays as a safety net.
   */
  private swingOutIfSqueezed(dt: number) {
    if (!this.target) return;
    const from = this.target.position.clone().add(new THREE.Vector3(0, 1, 0));
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(eulerDeg(this.pitch, this.yaw, 0));
    const hit = Physics.sphereCast(from, 0.28, dir, this.distance);
    if (!hit || hit.distance > this.distance * 0.75) return;
    const out = from.clone(); out.y = 0;
    if (out.lengthSq() < 1) return;                       // on the summit axis: nothing sensible to swing to
    out.normalize();
    const outwardYaw = Math.atan2(-out.x, -out.z) * Rad2Deg;   // yaw whose camera offset points away from the mountain
    this.yaw = moveTowardsAngle(this.yaw, outwardYaw, 160 * dt);
  }

  private place(dt: number, snap: boolean) {
    const t = this.target!;
    const want = t.position.clone().add(new THREE.Vector3(0, 1, 0));
    if (snap) this.followPos.copy(want); else this.followPos.lerp(want, 1 - Math.exp(-14 * dt));
    const rot = eulerDeg(this.pitch, this.yaw, 0);
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(rot);
    let dist = this.distance;
    const hit = Physics.sphereCast(this.followPos, 0.28, dir, this.distance);
    if (hit) dist = Math.max(0.8, hit.distance - 0.1);
    this.currentDist = snap ? dist : (dist < this.currentDist ? dist : lerp(this.currentDist, dist, 1 - Math.exp(-4 * dt)));
    this.cam.position.copy(this.followPos).addScaledVector(dir, this.currentDist);
    this.rot.copy(rot);

    // FOV kick while falling fast
    let fall = 0;
    const pc = PenguinController.instance;
    if (pc && pc.state === PState.Air) fall = inverseLerp(12, 35, -pc.velocity.y);
    const zoom = TrapEffects.activeCameraTroll?.kind === 'zoom';
    this.setFov(lerp(this.cam.fov, zoom ? 24 : 60 + fall * 14, snap ? 1 : dt * (zoom ? 10 : 3)));
  }

  private setFov(f: number) {
    if (Math.abs(f - this.cam.fov) > 0.001) { this.cam.fov = f; this.cam.updateProjectionMatrix(); }
  }
}
