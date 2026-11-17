import * as THREE from 'three';
import { DotNetRandom } from '../core/rng.ts';
import { STAGES, TIER_COUNT, LedgeKind, type StageDef } from '../core/StageData.ts';
import { col, lerp, inverseLerp, lerpColor, mulRGB, lookRotation, yawOf, UP } from '../core/math.ts';
import { MeshBuilder } from './MeshKit.ts';
import { ridged, fbm, noise3 } from './noise.ts';

export const SEED = 20261117;
export const JUMP_V = 5.3, MOVE_SPEED = 4.6, G = 9.81;

const f = Math.fround;

/** tier widths (round 3): each fake-summit plateau keeps a >= 4.5 m ring outside the tier that rises out of it, and the
 *  top tier is wide enough that its trail loops are too far apart to grab (no skips, no low ceilings) */
const TIER_TOP = [27.5, 19, 8.5];
const TIER_BASE = [NaN, 23, 14.5];      // tier 0's base follows from its height
/** how far the next tier's rock can reach at its base: base radius + base ring (0.8) + max bulge/jitter (0.3) */
const risingRadius = (t: number) => TIER_BASE[t + 1] + 1.1;

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
/** A jagged rock spire on a plateau rim (decoration with a collider). */
export interface CragSpec { tier: number; pos: THREE.Vector3; height: number; radius: number; seed: number; }
/** Space around a ledge that rock may never enter: its jump space and headroom (angles in radians). */
export interface Corridor { tier: number; ledge: number; angle: number; halfSpan: number; yMin: number; yMax: number; }

export interface MountainData {
  ledges: LedgeSpec[];
  extraLedges: LedgeSpec[];      // golden-fish side platforms (index -1)
  tiers: TierInfo[];
  stageMinY: number[]; stageMaxY: number[];
  spawnPoint: THREE.Vector3; spawnYaw: number;
  signs: SignSpec[]; flags: FlagSpec[]; fish: PointSpec[]; glows: PointSpec[];
  bodies: TierBody[];
  corridors: Corridor[];
  crags: CragSpec[];
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
    signs: [], flags: [], fish: [], glows: [], bodies: [], corridors: [], crags: [],
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
      // round 2: tiers taper much more so the mountain reads as a peak, not a cylinder (jumps are unchanged: gaps and
      // rises come from the step list, the radius only sets how tightly the trail winds)
      case 0: tier.rTop = TIER_TOP[0]; tier.rBase = tier.rTop + tier.height * 0.38; break;
      case 1: tier.rBase = TIER_BASE[1]; tier.rTop = TIER_TOP[1]; break;
      default: tier.rBase = TIER_BASE[2]; tier.rTop = TIER_TOP[2]; break;
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
    for (const l of [...out.ledges, ...out.extraLedges]) {
      if (l.tier !== t) continue;
      const r = Math.hypot(l.pos.x, l.pos.z);
      out.corridors.push({ tier: t, ledge: l.index, angle: Math.atan2(l.pos.z, l.pos.x), halfSpan: (l.size.z / 2 + 0.6) / r, yMin: l.pos.y - l.size.y - 0.5, yMax: l.pos.y + 3.0 });
    }
    out.bodies.push({ tier: t, mesh: buildTierMesh(tier, stageMaxY, out.corridors.filter(c => c.tier === t)) });

    // ---------- 4b. jagged crags around the plateau rim (fake summits only), clear of the arrival / flag / next-tier start
    if (t < TIER_COUNT - 1) {
      const n = t === 0 ? 14 : 9;
      for (let k = 0; k < n; k++) {
        const a = tier.arrivalAngle + 1.0 + (2 * Math.PI - 2.0) * (k + 0.5) / n + (noise3(k, t, 1, SEED) - 0.5) * 0.25;
        // on the rim edge, sized so they never reach in to where the next tier rises
        const rr = tier.rTop + 0.3;
        const maxRadius = (rr - (risingRadius(t) + 0.3)) / 1.35;
        const h = (t === 0 ? 4 : 3) + noise3(k, t, 3, SEED) * (t === 0 ? 7 : 4);
        out.crags.push({ tier: t, pos: new THREE.Vector3(Math.cos(a) * rr, tier.topY - 0.3, Math.sin(a) * rr), height: h, radius: Math.min(1.4 + h * 0.22, maxRadius), seed: SEED + t * 100 + k });
      }
    }

    // ---------- 5. summit flag
    if (t < TIER_COUNT - 1) {
      const fr = (tier.rTop + risingRadius(t)) / 2;       // middle of the free ring: clear of the rising tier and the rim
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

/** natural rock: a neutral grey-brown granite, only faintly tinted by the stage, blended smoothly between stages */
const GRANITE = col(0.47, 0.45, 0.43);
function rockColorAt(y: number, tier: TierInfo, stageMaxY: number[]) {
  let s = tier.lastStage;
  for (let k = tier.firstStage; k <= tier.lastStage; k++) if (y <= stageMaxY[k] + 0.5) { s = k; break; }
  const next = Math.min(tier.lastStage, s + 1);
  const t = Math.min(1, Math.max(0, (y - (stageMaxY[s] - 6)) / 12));          // 12 m soft blend into the next stage
  const tint = lerpColor(STAGES[s].rock, STAGES[next].rock, t);
  return lerpColor(GRANITE, tint, 0.28);
}

/** per-vertex deterministic jitter in [0,1) */
const jitter = (i: number, j: number, k: number, seed: number) => noise3(i * 1.618 + 0.5, j * 2.414 + 0.5, k * 3.141 + 0.5, seed);

/**
 * A natural craggy tier: the old smooth slope plus ridged rock ribs (spurs), gullies, cliff bands and facet jitter.
 * Hard rules (tested): rock never enters a ledge corridor, and off-path rock is always too steep to stand on.
 */
function buildTierMesh(tier: TierInfo, stageMaxY: number[], corridors: Corridor[]) {
  const seed = SEED + tier.index * 1000;
  const bottom = tier.baseY - (tier.index === 0 ? 2 : 3);
  const height = tier.topY - bottom;
  const rings = Math.max(8, Math.ceil(height / 2));   // ring spacing (2 m) > cell width (~1 m): no shelf-like faces
  const dy = height / rings;
  const segs = Math.min(360, Math.max(72, Math.round(2 * Math.PI * tier.rBase / 1.0)));
  const cell = 2 * Math.PI / segs;
  const carveAmp = [8, 5.5, 3.2][tier.index] ?? 3;   // how deep gullies/notches cut in between the trail loops
  const MAX_OUT_PER_M = 0.5;                     // dr/dy limit: keeps every face steeper than walkable (normal.y < 0.6)

  const R: number[][] = [], Y: number[][] = [], TH: number[][] = [], D: number[][] = [];
  const FIX: boolean[][] = [];
  for (let i = 0; i < segs; i++) { R.push([]); Y.push([]); TH.push([]); D.push([]); FIX.push([]); }

  const inCorridor = (th: number, y: number) => {
    for (const c of corridors) {
      if (y < c.yMin - dy * 1.1 || y > c.yMax + dy * 1.1) continue;
      let d = th - c.angle; d = Math.atan2(Math.sin(d), Math.cos(d));
      if (Math.abs(d) <= c.halfSpan + cell * 1.6) return true;
    }
    return false;
  };

  for (let j = 0; j <= rings; j++) {
    const yy = bottom + dy * j;
    for (let i = 0; i < segs; i++) {
      const th = 2 * Math.PI * (i + (j % 2) * 0.5) / segs;
      const y = (j === 0 || j === rings) ? yy : yy + (jitter(i, j, 1, seed) - 0.5) * dy * 0.15;
      const base = tier.slopeR(Math.max(y, tier.baseY));
      const nx = Math.cos(th) * base, nz = Math.sin(th) * base;
      // vertical rock ribs (spurs) + gullies + cliff bands + facets
      // rock is CARVED INWARD between the trail loops (gullies/notches), leaving ribs standing; it never bulges out
      // more than ~0.8 m, so a falling penguin still lands on the trail below (ledges stick out 0.6–4 m)
      const ribs = ridged(nx * 0.03, y * 0.012, nz * 0.03, 3, seed + 1);          // 1 = crest of a rock rib
      const fine = ridged(nx * 0.09, y * 0.03, nz * 0.09, 2, seed + 4);
      const notch = fbm(nx * 0.04, y * 0.06, nz * 0.04, 3, seed + 2);
      const band = fbm(nx * 0.02, y * 0.11, nz * 0.02, 2, seed + 3);
      let d = -carveAmp * Math.pow(1 - ribs, 0.7) - Math.max(0, notch) * carveAmp * 0.7 - (1 - fine) * 1.4 + Math.max(0, band) * 0.6 + (jitter(i, j, 2, seed) - 0.5) * 0.9;
      d = Math.min(d, 0.3);   // never sticks out past even the thinnest beam (0.55 m)
      // the foot of the mountain flares out into scree instead of meeting the ground in a hard edge
      if (tier.index === 0) d += Math.pow(Math.max(0, 14 - (y - tier.baseY)), 1.5) * 0.3;
      if (j === rings) d = 0;                       // plateau rim stays exactly at rTop (summit checks + rising tiers)
      let r = base + d;
      if (j === 0) r += 0.8;
      const fix = inCorridor(th, y);
      if (fix) r = tier.slopeR(y) + 0.1;   // the trail band: rock flush behind every ledge
      if (j === rings) r = tier.rTop;      // plateau rim
      FIX[i][j] = fix || j === rings;
      R[i][j] = r; Y[i][j] = y; TH[i][j] = th; D[i][j] = d;
    }
  }

  // smoothness rule between vertically connected vertices: a lower vertex may stick out at most K per metre beyond
  // the one above it (keeps every face steeper than walkable: no shelves to get stuck on). Trail-band and rim vertices
  // are fixed; free vertices are pushed out/in until the rule holds (rock fills smoothly between carved notches).
  const K = 0.5;
  const ups = (i: number, j: number) => (j % 2 === 0 ? [i, (i + segs - 1) % segs] : [i, (i + 1) % segs]);
  for (let pass = 0; pass < 60; pass++) {
    let worst = 0;
    for (let j = 0; j < rings; j++)
      for (let i = 0; i < segs; i++)
        for (const u of ups(i, j)) {
          const lim = K * Math.max(0.01, Y[u][j + 1] - Y[i][j]);
          const excess = R[i][j] - R[u][j + 1] - lim;       // > 0: (i,j) juts out under (u,j+1) like a shelf
          if (excess <= 1e-6) continue;
          worst = Math.max(worst, excess);
          const lowFixed = FIX[i][j], upFixed = FIX[u][j + 1];
          if (lowFixed && upFixed) continue;                 // two fixed trail vertices: already a steep cut
          if (lowFixed) R[u][j + 1] += excess;               // fill the rock above out
          else if (upFixed) R[i][j] -= excess;               // carve the rock below in
          else { R[i][j] -= excess / 2; R[u][j + 1] += excess / 2; }
        }
    if (worst < 1e-4) break;
  }

  const pts: THREE.Vector3[][] = [];
  for (let i = 0; i < segs; i++) { pts.push([]); for (let j = 0; j <= rings; j++) pts[i][j] = new THREE.Vector3(Math.cos(TH[i][j]) * R[i][j], Y[i][j], Math.sin(TH[i][j]) * R[i][j]); }



  const mb = new MeshBuilder();
  const snow = col(0.93, 0.96, 1), snowShade = col(0.84, 0.89, 0.97), ice = col(0.72, 0.86, 0.96);
  const tmp = new THREE.Vector3();
  const face = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, dd: number) => {
    const outward = tmp.copy(a).add(b).add(c).multiplyScalar(1 / 3); outward.y = 0;
    const n = new THREE.Vector3().crossVectors(b.clone().sub(a), c.clone().sub(a)).normalize();
    if (n.dot(outward) < 0) n.negate();
    const yMid = (a.y + b.y + c.y) / 3;
    const h01 = (yMid - tier.baseY) / Math.max(1, tier.topY - tier.baseY);
    const cx = outward.x, cz = outward.z;
    let rock = rockColorAt(yMid, tier, stageMaxY);
    // crevices (pulled-in rock) darker, buttresses lighter, plus blotchy variation
    rock = mulRGB(rock, 0.8 + noise3(cx * 0.3, yMid * 0.3, cz * 0.3, seed + 7) * 0.28 + Math.max(-0.22, Math.min(0.15, dd * 0.05)));
    // patchy snow: on the less steep faces, more of it higher up and on the top tier
    const snowChance = -0.2 + h01 * 0.3 + tier.index * 0.18 + (n.y - 0.3) * 1.4;
    const patch = noise3(cx * 0.12, yMid * 0.12, cz * 0.12, seed + 9);
    let c1 = rock;
    if (patch < snowChance) c1 = n.y > 0.3 ? snow : snowShade;
    else if (tier.index === 2 && patch < snowChance + 0.18) c1 = ice;
    mb.tri(a, b, c, c1, outward.clone());
  };
  for (let j = 0; j < rings; j++)
    for (let i = 0; i < segs; i++) {
      const i2 = (i + 1) % segs;
      const a = pts[i][j], b = pts[i2][j], c = pts[i2][j + 1], d = pts[i][j + 1];
      const dd = (D[i][j] + D[i2][j + 1]) / 2;
      face(a, b, c, dd);
      face(a, c, d, dd);
    }
  // flat plateau cap (walkable on purpose: summit flag + the next tier rises out of it)
  const center = new THREE.Vector3(0, tier.topY, 0);
  for (let i = 0; i < segs; i++) {
    const sc = (i % 3 === 0) ? col(0.88, 0.92, 0.98) : snow;
    mb.tri(pts[i][rings], pts[(i + 1) % segs][rings], center, sc, new THREE.Vector3(0, 1, 0));
  }
  return mb;
}
