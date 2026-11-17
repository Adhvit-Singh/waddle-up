import * as THREE from 'three';
import { Time } from '../core/time.ts';
import { Loop } from '../core/loop.ts';
import { UnityRandom } from '../core/rng.ts';
import { col, clamp, clamp01, lerp, moveTowards, moveTowardsAngle, eulerDeg, Rad2Deg } from '../core/math.ts';
import { MeshBuilder, meshObject, Mats } from '../world/MeshKit.ts';
import { CATEGORY_ORDER, DEFAULT_OUTFIT, buildItem, type Anchor, type MatKind, type OutfitIds } from './cosmetics/Catalog.ts';
import { Outfit } from './cosmetics/Outfit.ts';
import { MOVE_SPEED } from '../world/MountainData.ts';
import { PenguinController, PState } from './PenguinController.ts';

const ORANGE = col(1, 0.55, 0.12);
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

const mats: Partial<Record<MatKind, THREE.Material>> = {};
function material(kind: MatKind): THREE.Material {
  if (kind === 'normal') return Mats.vertexColor;
  if (!mats[kind]) {
    const m = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    if (kind === 'ghost') { m.transparent = true; m.opacity = 0.42; m.depthWrite = false; }
    if (kind === 'glow') { m.emissive.setRGB(0.1, 0.55, 0.4); }
    if (kind === 'chrome') { m.emissive.setRGB(0.28, 0.18, 0.02); }
    mats[kind] = m;
  }
  return mats[kind]!;
}

/** Builds the low-poly penguin skeleton, dresses it from the wardrobe, and animates it procedurally. */
export class PenguinVisual {
  static instance: PenguinVisual;
  private pc: PenguinController;
  private root = new THREE.Group();
  private body = new THREE.Group(); private head = new THREE.Group(); private flipL = new THREE.Group(); private flipR = new THREE.Group();
  private footL = new THREE.Group(); private footR = new THREE.Group(); private eyes = new THREE.Group();
  private waddle = 0; private blinkTimer = 2; private blink = 0; private squash = 1; private flop = 0;
  private yaw = 0;
  private dressed: THREE.Mesh[] = [];
  outfit: OutfitIds = { ...DEFAULT_OUTFIT };
  /** wardrobe: face this point (world) instead of the movement direction; null = normal */
  lookAtPoint: THREE.Vector3 | null = null;

  constructor(pc: PenguinController) {
    PenguinVisual.instance = this;
    this.pc = pc;
    this.root.name = 'PenguinModel';
    pc.object.add(this.root);
    this.build();
    this.applyOutfit(Outfit.load());
    Loop.add(this);
  }

  private build() {
    // animated skeleton (same proportions as the original penguin)
    this.body.position.set(0, 0.5, 0); this.root.add(this.body);
    this.head.position.set(0, 0.46, 0.02); this.body.add(this.head);
    this.eyes.position.set(0, 0.06, 0); this.head.add(this.eyes);      // blink squashes this group
    this.flipL.position.set(0.33, 0.15, 0); this.body.add(this.flipL);
    this.flipR.position.set(-0.33, 0.15, 0); this.body.add(this.flipR);
    this.footL.position.set(0.13, 0.04, 0.08); this.root.add(this.footL);
    this.footR.position.set(-0.13, 0.04, 0.08); this.root.add(this.footR);
    // the beak and rosy cheeks never change
    const face = new MeshBuilder();
    face.coneAxis(V(0, -0.04, 0.25), V(0, -0.15, 1), 0.075, 0.2, ORANGE, 6);
    face.sphere(V(0.14, -0.07, 0.19), V(0.045, 0.03, 0.02), col(1, 0.55, 0.6), 5, 3);
    face.sphere(V(-0.14, -0.07, 0.19), V(0.045, 0.03, 0.02), col(1, 0.55, 0.6), 5, 3);
    meshObject('Face', face.build(), this.head);
  }

  /** Dress the penguin (wardrobe). Purely visual: never touches physics or gameplay. */
  applyOutfit(o: OutfitIds) {
    for (const m of this.dressed) { m.removeFromParent(); m.geometry.dispose(); }
    this.dressed = [];
    this.outfit = { ...o };
    const anchors: Record<Anchor, THREE.Object3D> = { body: this.body, head: this.head, flipL: this.flipL, flipR: this.flipR, footL: this.footL, footR: this.footR, root: this.root };
    for (const cat of CATEGORY_ORDER) {
      for (const part of buildItem(cat, o[cat])) {
        let parent = anchors[part.anchor];
        const m = meshObject(cat, part.mesh.build(), null, true, material(part.material));
        if (cat === 'eyes') { parent = this.eyes; m.position.set(0, -0.06, 0); }
        if (cat === 'hat' && o.hat === 'beanie') { m.position.set(0, 0, 0); m.quaternion.copy(eulerDeg(-8, 0, 12)); }
        parent.add(m);
        this.dressed.push(m);
      }
    }
  }

  lateUpdate() {
    const pc = this.pc;
    const dt = Time.deltaTime;
    const st = pc.state;
    const now = Time.time;

    if (st !== PState.Ragdoll) {
      const f = this.lookAtPoint ? this.lookAtPoint.clone().sub(pc.object.position) : pc.facing.clone(); f.y = 0;
      if (f.lengthSq() > 0.000001) {
        const target = Math.atan2(f.x, f.z) * Rad2Deg;
        this.yaw = moveTowardsAngle(this.yaw, target, 900 * Math.max(dt, this.lookAtPoint ? Time.unscaledDeltaTime : 0));
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
    this.eyes.scale.set(1, ey, 1);
  }
}
