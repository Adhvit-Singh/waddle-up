import * as THREE from 'three';
import { DotNetRandom } from '../core/rng.ts';
import { STAGES, TIER_COUNT, LedgeKind, type StageDef } from '../core/StageData.ts';
import { col, lerp, inverseLerp, lerpColor, mulRGB, lookRotation, yawOf, UP } from '../core/math.ts';
import { MeshBuilder } from './MeshKit.ts';

export const SEED = 20261117;
export const JUMP_V = 5.3, MOVE_SPEED = 4.6, G = 9.81;

const f = Math.fround;

export class TierInfo {
  index = 0;
  baseY = 0; topY = 0; rBase = 0; rTop = 0;
  arrivalAngle = 0; startAngle = 0;
  flagPos = new THREE.Vector3();
  firstStage = -1; lastStage = -1;
  get height() { return this.topY - this.baseY; }
  slopeR(y: number) { return lerp(this.rBase, this.rTop, inverseLerp(this.baseY, this.topY, y)); }
}

export interface LedgeSpec {
  index: number; stage: number; kind: LedgeKind; tier: number;
  size: THREE.Vector3;          // x = radial depth, y = thickness, z = tangent length
  pos: THREE.Vector3; rot: THREE.Quaternion;
  rock: THREE.Color; top: THREE.Color; seed: number;
}

export interface SignSpec { tier: number; pos: THREE.Vector3; rot: THREE.Quaternion; text: string; scale: number; }
export interface FlagSpec { tier: number; pos: THREE.Vector3; height: number; color: THREE.Color; label: string | null; labelScale: number; checkpointStage: number | null; }
export interface PointSpec { tier: number; pos: THREE.Vector3; color?: THREE.Color; }
export interface TierBody { tier: number; mesh: MeshBuilder; }

export interface MountainData {
  ledges: LedgeSpec[];
  extraLedges: LedgeSpec[];      // golden-fish side platforms (index -1)
  tiers: TierInfo[];
  stageMinY: number[]; stageMaxY: number[];
  spawnPoint: THREE.Vector3; spawnYaw: number;
  signs: SignSpec[]; flags: FlagSpec[]; fish: PointSpec[]; glows: PointSpec[];
  bodies: TierBody[];
}

interface Step { kind: LedgeKind; stage: number; rise: number; gap: number; depth: number; length: number; thick: number; top: number; }

export function generateMountain(): MountainData {
  const rng = new DotNetRandom(SEED);
  const R = (a: number, b: number) => a + rng.nextDouble() * (b - a);
  const stages = STAGES;
  const stageMinY = new Array<number>(stages.length).fill(0);
  const stageMaxY = new Array<number>(stages.length).fill(0);
  const tiers: TierInfo[] = [];
  const out: MountainData = {
    ledges: [], extraLedges: [], tiers, stageMinY, stageMaxY, spawnPoint: new THREE.Vector3(), spawnYaw: 0,
    signs: [], flags: [], fish: [], glows: [], bodies: [],
  };

  function makeStep(k: LedgeKind, diff: number, stage: number, isStart: boolean): Step {
    const s: Step = { kind: k, stage, rise: 0, gap: 0, depth: 0, length: 0, thick: 0, top: 0 };
    switch (k) {
      case LedgeKind.Rest: s.depth = 3.3; s.length = 3.8; s.rise = R(0.35, 0.7); s.thick = 1.8; break;
      case LedgeKind.Normal: s.depth = R(2.1, 2.8); s.length = R(2.0, 3.0) - diff * 0.5; s.rise = R(0.3, 1.1); s.thick = 1.5; break;
      case LedgeKind.Wall: s.depth = 2.5; s.length = 2.2; s.rise = R(1.9, 2.3) + diff * 0.15; s.thick = s.rise + 1.6; break;
      case LedgeKind.Beam: s.depth = lerp(0.85, 0.55, diff); s.length = R(4.2, 5.4); s.rise = R(0.05, 0.4); s.thick = 0.4; break;
      case LedgeKind.Ice: s.depth = 2.4; s.length = R(2.6, 3.3); s.rise = R(0.15, 0.6); s.thick = 0.8; break;
      case LedgeKind.Moving: s.depth = 2.3; s.length = 2.4; s.rise = R(0.05, 0.3); s.thick = 0.6; break;
      case LedgeKind.Rotating: s.depth = 3.0; s.length = 3.0; s.rise = R(0.15, 0.5); s.thick = 0.6; break;
      case LedgeKind.Crumble: s.depth = 2.2; s.length = 2.2; s.rise = R(0.2, 0.7); s.thick = 0.7; break;
      case LedgeKind.Blink: s.depth = 2.4; s.length = 2.4; s.rise = R(0.15, 0.6); s.thick = 0.5; break;
      case LedgeKind.Bouncy: s.depth = 2.6; s.length = 2.6; s.rise = R(0, 0.3); s.thick = 0.6; break;
      case LedgeKind.Conveyor: s.depth = 2.2; s.length = 4.2; s.rise = R(0.1, 0.3); s.thick = 0.6; break;
      case LedgeKind.Sweeper: s.depth = 3.6; s.length = 3.6; s.rise = R(0.1, 0.4); s.thick = 0.8; break;
    }
    if (isStart) { s.rise = 0.5; s.depth = 4.5; s.length = 5; }

    if (k === LedgeKind.Wall) s.gap = R(0.35, 0.75);
    else {
      // physically reachable horizontal distance for this rise, scaled by a difficulty safety factor
      const disc = JUMP_V * JUMP_V - 2 * G * Math.min(s.rise, 1.3);
      const airT = (JUMP_V + Math.sqrt(Math.max(0.01, disc))) / G;
      const reach = MOVE_SPEED * airT;
      const safety = lerp(0.38, 0.68, diff);
      const maxGap = Math.max(0.9, reach * safety);
      const minGap = Math.min(0.7, maxGap);
      s.gap = lerp(minGap, maxGap, Math.min(1, Math.max(0, 0.35 + rng.nextDouble() * 0.65 * (0.4 + diff))));
      if (k === LedgeKind.Beam) s.gap *= 0.85;
    }
    s.length = Math.max(1.6, s.length);
    return s;
  }

  let y = 0, angle = 0, ledgeIndex = 0;

  for (let t = 0; t < TIER_COUNT; t++) {
    const tier = new TierInfo();
    tier.index = t; tier.baseY = y;
    tiers.push(tier);

    // ---------- 1. build the step list for this tier
    const steps: Step[] = [];
    let cy = y;
    for (let s = 0; s < stages.length; s++) {
      const def = stages[s];
      if (def.tier !== t) continue;
      if (tier.firstStage < 0) tier.firstStage = s;
      tier.lastStage = s;
      stageMinY[s] = cy;
      for (let j = 0; j < def.count; j++) {
        let k: LedgeKind = j === 0 ? LedgeKind.Rest : def.pool[rng.next(def.pool.length)];
        if (j > 1 && k !== LedgeKind.Rest && rng.nextDouble() < def.wallChance && !(k === LedgeKind.Moving || k === LedgeKind.Rotating || k === LedgeKind.Sweeper))
          k = LedgeKind.Wall;
        if (s === 0) k = j === 0 ? LedgeKind.Rest : LedgeKind.Normal;
        const st = makeStep(k, def.difficulty, s, j === 0 && s === 0 && t === 0);
        cy += st.rise;
        st.top = cy;
        steps.push(st);
      }
      stageMaxY[s] = cy;
    }
    tier.topY = cy + 1.0;

    // ---------- 2. tier shape
    switch (t) {
      case 0: tier.rTop = 34; tier.rBase = tier.rTop + tier.height * f(0.3); break;
      case 1: tier.rBase = 24; tier.rTop = 15; break;
      default: tier.rBase = 11.5; tier.rTop = 5.5; break;
    }

    // ---------- 3. place the ledges along the spiral
    if (t > 0) angle = tiers[t - 1].arrivalAngle + 0.35;
    tier.startAngle = angle;
    let prevLen = 0;
    for (let i = 0; i < steps.length; i++) {
      const st = steps[i];
      const r = tier.slopeR(st.top) + 0.1 + st.depth * 0.5;
      if (i > 0) angle += (prevLen * 0.5 + st.gap + st.length * 0.5) / r;
      prevLen = st.length;
      const pos = new THREE.Vector3(Math.cos(angle) * r, st.top, Math.sin(angle) * r);
      const tangent = new THREE.Vector3(-Math.sin(angle), 0, Math.cos(angle));
      const def = stages[st.stage];
      const spec: LedgeSpec = {
        index: ledgeIndex, stage: st.stage, kind: st.kind, tier: t,
        size: new THREE.Vector3(st.depth, st.thick, st.length),
        pos, rot: lookRotation(tangent, UP), rock: def.rock, top: def.top, seed: SEED + ledgeIndex * 31,
      };
      out.ledges.push(spec);
      if (st.kind === LedgeKind.Rest) decorateRest(out, spec, def, st.stage, t);
      ledgeIndex++;
    }
    tier.arrivalAngle = angle;

    // ---------- 4. mountain body
    out.bodies.push({ tier: t, mesh: buildTierMesh(tier, stageMaxY) });

    // ---------- 5. summit flag
    if (t < TIER_COUNT - 1) {
      const fr = tier.rTop - 2.6;
      const fa = tier.arrivalAngle + 0.08;
      tier.flagPos = new THREE.Vector3(Math.cos(fa) * fr, tier.topY, Math.sin(fa) * fr);
      out.flags.push({ tier: t, pos: tier.flagPos.clone(), height: 4.2, color: col(1, 0.85, 0.2), label: 'SUMMIT!', labelScale: 1.4, checkpointStage: null });
    } else {
      tier.flagPos = new THREE.Vector3(0, tier.topY, 0);
      out.flags.push({ tier: t, pos: tier.flagPos.clone(), height: 6, color: col(1, 0.35, 0.25), label: 'THE ACTUAL\nSUMMIT', labelScale: 2, checkpointStage: null });
      out.glows.push({ tier: t, pos: tier.flagPos.clone().add(new THREE.Vector3(0, 1.5, 0)), color: col(1, 0.9, 0.5) });
    }

    y = tier.topY;
  }

  const first = out.ledges[0];
  out.spawnPoint = first.pos.clone().add(new THREE.Vector3(0, 0.05, 0));
  const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(first.rot);
  out.spawnYaw = ((yawOf(fwd) % 360) + 360) % 360;
  return out;
}

function axes(spec: LedgeSpec) {
  const right = new THREE.Vector3(1, 0, 0).applyQuaternion(spec.rot);
  const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(spec.rot);
  return { right, forward };
}

function decorateRest(out: MountainData, ledge: LedgeSpec, def: StageDef, stage: number, tier: number) {
  const { right, forward } = axes(ledge);
  const P = ledge.pos, sz = ledge.size;
  const outer = P.clone().addScaledVector(right, sz.x * 0.5 - 0.45);
  const inner = P.clone().addScaledVector(right, -(sz.x * 0.5 - 0.5));
  const title = stage === 0 && ledge.index === 0
    ? 'WADDLE UP\n<size=60>the only way is up\n(and down)</size>'
    : `STAGE ${stage + 1}\n<size=60>${def.name}</size>`;
  const back = lookRotation(forward.clone().negate(), UP);
  out.signs.push({ tier, pos: outer.clone().addScaledVector(forward, -(sz.z * 0.5 - 0.5)), rot: back, text: title, scale: 1 });
  if (ledge.index !== 0) {
    out.flags.push({ tier, pos: inner.clone().addScaledVector(forward, sz.z * 0.5 - 0.6), height: 2.2, color: col(0.3, 0.85, 0.4), label: null, labelScale: 0, checkpointStage: stage });
  }
  if (def.fishShortcut) {
    // a side platform sticking outward with a golden fish and a SHORTCUT sign
    const p = P.clone().addScaledVector(right, sz.x * 0.5 + 2.3).addScaledVector(forward, 0.3);
    out.extraLedges.push({
      index: -1, stage, kind: LedgeKind.Normal, tier, size: new THREE.Vector3(1.8, 0.5, 1.8), pos: p, rot: ledge.rot.clone(),
      rock: col(0.85, 0.7, 0.25), top: col(1, 0.95, 0.6), seed: SEED + stage * 977,
    });
    out.fish.push({ tier, pos: p.clone().add(new THREE.Vector3(0, 0.6, 0)) });
    out.signs.push({
      tier, pos: P.clone().addScaledVector(right, sz.x * 0.5 - 0.4).addScaledVector(forward, sz.z * 0.5 - 0.5), rot: back,
      text: 'SHORTCUT\n<size=60>-> totally legit -></size>', scale: 0.75,
    });
  }
}

function rockColorAt(y: number, tier: TierInfo, stageMaxY: number[]) {
  for (let s = tier.firstStage; s <= tier.lastStage; s++)
    if (y <= stageMaxY[s] + 0.5)
      return mulRGB(lerpColor(STAGES[s].rock, col(0.45, 0.45, 0.52), 0.2), 0.92);
  return lerpColor(STAGES[tier.lastStage].rock, col(1, 1, 1), 0.3);
}

function buildTierMesh(tier: TierInfo, stageMaxY: number[]) {
  const r = new DotNetRandom(SEED + tier.index * 1000);
  const bottom = tier.baseY - (tier.index === 0 ? 2 : 3);
  const height = tier.topY - bottom;
  const rings = Math.max(4, Math.ceil(height / 6.5));
  const segs = Math.min(48, Math.max(14, Math.round(2 * Math.PI * tier.rBase / 6.5)));
  const pts: THREE.Vector3[][] = [];
  for (let i = 0; i < segs; i++) pts.push([]);
  for (let j = 0; j <= rings; j++) {
    const yy = lerp(bottom, tier.topY, j / rings);
    for (let i = 0; i < segs; i++) {
      const th = 2 * Math.PI * (i + (j % 2) * 0.5) / segs;
      const jit = j === rings ? 0 : r.nextDouble() * 1.05 - 0.9;
      let rr = tier.slopeR(Math.max(yy, tier.baseY)) + jit;
      if (j === 0) rr += 0.8;
      const yj = (j === 0 || j === rings) ? yy : yy + (r.nextDouble() - 0.5) * 2.0;
      pts[i][j] = new THREE.Vector3(Math.cos(th) * rr, yj, Math.sin(th) * rr);
    }
  }
  const mb = new MeshBuilder();
  const snow = col(0.93, 0.96, 1);
  for (let j = 0; j < rings; j++)
    for (let i = 0; i < segs; i++) {
      const i2 = (i + 1) % segs;
      const a = pts[i][j], b = pts[i2][j], c = pts[i2][j + 1], d = pts[i][j + 1];
      const yMid = (a.y + c.y) * 0.5;
      const rock = rockColorAt(yMid, tier, stageMaxY);
      const n = r.nextDouble();
      const c1 = n < 0.1 ? snow : mulRGB(rock, 0.88 + r.nextDouble() * 0.2);
      const c2 = n > 0.9 ? snow : mulRGB(rock, 0.85 + r.nextDouble() * 0.2);
      const outward = a.clone().add(c).multiplyScalar(0.5); outward.y = 0;
      mb.tri(a, b, c, c1, outward);
      mb.tri(a, c, d, c2, outward);
    }
  // flat plateau cap
  const center = new THREE.Vector3(0, tier.topY, 0);
  for (let i = 0; i < segs; i++) {
    const sc = (i % 3 === 0) ? col(0.88, 0.92, 0.98) : snow;
    mb.tri(pts[i][rings], pts[(i + 1) % segs][rings], center, sc, new THREE.Vector3(0, 1, 0));
  }
  return mb;
}
