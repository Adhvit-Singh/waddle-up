import * as THREE from 'three';
import { Physics, RAPIER } from '../physics/Physics.ts';
import { generateMountain, type MountainData, type TierInfo, type FlagSpec } from './MountainData.ts';
import { meshObject } from './MeshKit.ts';
import { Ledge } from './Ledge.ts';
import { Props } from './Props.ts';
import type { ParticleSystem } from './Effects.ts';
import { trimeshCollider } from './WorldDecor.ts';

export interface TierRuntime extends TierInfo { root: THREE.Group; }

/** Builds the whole mountain from MountainData: 3 stacked tiers, each a jagged low-poly frustum with a spiral of ledges. */
export class MountainGenerator {
  static instance: MountainGenerator;
  readonly root = new THREE.Group();
  data!: MountainData;
  ledges: Ledge[] = [];
  extraLedges: Ledge[] = [];
  tiers: TierRuntime[] = [];
  spawnPoint = new THREE.Vector3();
  spawnYaw = 0;
  stageMinY: number[] = [];
  stageMaxY: number[] = [];
  /** checkpoint flags (for FakeCheckpoint) and fish (for ShortcutFish) */
  checkpointFlags: { object: THREE.Object3D; stage: number; tier: number }[] = [];
  fishes: { object: THREE.Object3D; tier: number; glow: ParticleSystem }[] = [];
  private glows: { ps: ParticleSystem; tier: number }[] = [];
  private bodies: { tier: number; body: RAPIER.RigidBody; collider: RAPIER.Collider }[] = [];
  private tierVisible: boolean[] = [];

  /** set by the game so StageAtHeight knows how many tiers exist right now */
  tiersRevealed = () => 0;

  get summitY() { return this.tiers[this.tiers.length - 1].topY; }

  constructor(scene: THREE.Scene) {
    MountainGenerator.instance = this;
    this.root.name = 'Mountain';
    scene.add(this.root);
  }

  generate() {
    const d = this.data = generateMountain();
    this.spawnPoint.copy(d.spawnPoint);
    this.spawnYaw = d.spawnYaw;
    this.stageMinY = d.stageMinY; this.stageMaxY = d.stageMaxY;
    for (const t of d.tiers) {
      const root = new THREE.Group();
      root.name = `Tier${t.index + 1}`;
      this.root.add(root);
      const rt = t as TierRuntime;
      rt.root = root;
      this.tiers.push(rt);
      this.tierVisible.push(true);
    }
    for (const s of d.ledges) this.ledges.push(new Ledge(s, this.tiers[s.tier].root));
    for (const s of d.extraLedges) this.extraLedges.push(new Ledge(s, this.tiers[s.tier].root));
    for (const s of d.signs) Props.sign(this.tiers[s.tier].root, s.pos, s.rot, s.text, s.scale);
    for (const f of d.flags) this.buildFlag(f);
    for (const f of d.fish) {
      const fish = Props.fish(this.tiers[f.tier].root, f.pos);
      this.fishes.push({ object: fish.object, tier: f.tier, glow: fish.glow });
    }
    for (const g of d.glows) this.glows.push({ ps: Props.glow(g.pos, g.color!), tier: g.tier });
    for (const b of d.bodies) {
      meshObject('MountainBody', b.mesh.build(), this.tiers[b.tier].root);
      const tc = trimeshCollider(b.mesh, { mountain: b.tier, object: this.tiers[b.tier].root });
      this.bodies.push({ tier: b.tier, ...tc });
    }
    for (let t = 1; t < this.tiers.length; t++) this.setTierActive(t, false);
  }

  private buildFlag(f: FlagSpec) {
    const root = this.tiers[f.tier].root;
    const go = Props.flag(root, f.pos, f.height, f.color, f.label, f.labelScale);
    // Unity: CapsuleCollider on the pole
    const wp = f.pos;
    const body = Physics.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(wp.x, wp.y + f.height * 0.5, wp.z));
    const c = Physics.world.createCollider(RAPIER.ColliderDesc.capsule(Math.max(0.01, f.height * 0.5 - 0.1), 0.1), body);
    body.userData = { base: new THREE.Vector3(wp.x, wp.y + f.height * 0.5, wp.z) };
    Physics.register(c, { object: go });
    this.bodies.push({ tier: f.tier, body, collider: c });
    if (f.checkpointStage !== null) this.checkpointFlags.push({ object: go, stage: f.checkpointStage, tier: f.tier });
  }

  /** GameObject.SetActive for a whole tier (visibility + colliders). */
  setTierActive(t: number, on: boolean) {
    this.tierVisible[t] = on;
    this.tiers[t].root.visible = on;
    for (const l of [...this.ledges, ...this.extraLedges]) if (l.root === this.tiers[t].root) l.setTierActive(on);
    for (const b of this.bodies) if (b.tier === t) b.collider.setEnabled(on);
    for (const g of this.glows) if (g.tier === t) g.ps.points.visible = on;
    for (const f of this.fishes) if (f.tier === t) f.glow.points.visible = on;
  }
  isTierActive(t: number) { return this.tierVisible[t]; }

  /** After moving a tier root (rising cutscene), teleport its colliders along. */
  syncTier(t: number) {
    const root = this.tiers[t].root;
    root.updateMatrixWorld(true);
    for (const l of [...this.ledges, ...this.extraLedges]) if (l.root === root) l.syncBodies();
    const p = root.position;
    for (const b of this.bodies) if (b.tier === t) {
      const isMountain = Physics.ownerOf(b.collider)?.mountain !== undefined;
      if (isMountain) b.body.setTranslation(p, true);
      else b.body.setTranslation((b.body.userData as { base: THREE.Vector3 }).base.clone().add(p), true);
    }
  }

  // ------------------------------------------------------------------ queries

  stageAtHeight(y: number) {
    const revealed = this.tiersRevealed();
    const maxStage = this.tiers[Math.min(Math.max(revealed, 0), this.tiers.length - 1)].lastStage;
    for (let s = 0; s <= maxStage; s++) if (y <= this.stageMaxY[s] + 0.6) return s;
    return maxStage;
  }

  getLedge(index: number) { return index >= 0 && index < this.ledges.length ? this.ledges[index] : null; }

  resetAllLedges() {
    for (const l of this.ledges) if (this.tierVisible[this.tiers.findIndex(t => t.root === l.root)]) l.resetState();
  }
}
