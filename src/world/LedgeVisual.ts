import * as THREE from 'three';
import { DotNetRandom } from '../core/rng.ts';
import { LedgeKind } from '../core/StageData.ts';
import { col, lerpColor, mulRGB } from '../core/math.ts';
import { MeshBuilder } from './MeshKit.ts';
import { noise3 } from './noise.ts';
import type { LedgeSpec } from './MountainData.ts';

/** Ledge kinds that are part of the mountain (rock outcrops). Moving/rotating/bouncy/conveyor/sweeper stay man-made. */
export function isRocky(kind: LedgeKind) {
  return kind === LedgeKind.Normal || kind === LedgeKind.Rest || kind === LedgeKind.Wall || kind === LedgeKind.Beam
    || kind === LedgeKind.Ice || kind === LedgeKind.Crumble || kind === LedgeKind.Blink;
}

const GRANITE = col(0.47, 0.45, 0.43);
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

interface Palette { side: THREE.Color; cap: THREE.Color; snow: THREE.Color | null; crack: THREE.Color | null; crystal: boolean; }

function palette(spec: LedgeSpec): Palette {
  const rock = lerpColor(GRANITE, spec.rock, 0.3);
  switch (spec.kind) {
    case LedgeKind.Ice: return { side: col(0.55, 0.76, 0.9), cap: col(0.84, 0.95, 1), snow: col(0.95, 0.99, 1), crack: null, crystal: false };
    case LedgeKind.Crumble: return { side: col(0.5, 0.37, 0.27), cap: col(0.7, 0.56, 0.42), snow: null, crack: col(0.18, 0.12, 0.08), crystal: false };
    case LedgeKind.Blink: return { side: col(0.42, 0.36, 0.72), cap: col(0.72, 0.66, 1), snow: null, crack: null, crystal: true };
    case LedgeKind.Rest: return { side: rock, cap: lerpColor(lerpColor(spec.top, rock, 0.25), col(1, 1, 1), 0.35), snow: col(0.94, 0.96, 1), crack: null, crystal: false };
    default: return { side: rock, cap: lerpColor(spec.top, rock, 0.45), snow: col(0.93, 0.96, 1), crack: null, crystal: false };
  }
}

/**
 * A rocky outcrop for a ledge. Local frame: origin = centre of the top surface, +X = outward, -X = into the mountain,
 * +Z = along the path. Rules (tested): the top is exactly the walkable rectangle at y = 0 (bumps ≤ 3 cm), and nothing
 * pokes outside the walkable footprint (|z| ≤ size.z/2, x ≤ size.x/2). The underside tapers back into the cliff.
 */
export function buildLedgeVisual(spec: LedgeSpec): MeshBuilder {
  const { size } = spec;
  const hx = size.x / 2, hz = size.z / 2;
  const rng = new DotNetRandom(spec.seed + 7777);
  const rnd = () => rng.nextDouble();
  const pal = palette(spec);
  const mb = new MeshBuilder();
  const sharp = spec.kind === LedgeKind.Ice || spec.kind === LedgeKind.Blink;

  // ---------------------------------------------------------------- top: flat walkable rectangle
  const nx = Math.max(2, Math.round(size.x / 0.55)), nz = Math.max(2, Math.round(size.z / 0.55));
  const topV: THREE.Vector3[][] = [];
  for (let a = 0; a <= nx; a++) {
    topV.push([]);
    for (let b = 0; b <= nz; b++) {
      const x = -hx + size.x * a / nx, z = -hz + size.z * b / nz;
      const interior = a > 0 && a < nx && b > 0 && b < nz;
      topV[a][b] = V(x, interior ? rnd() * 0.03 : 0, z);
    }
  }
  for (let a = 0; a < nx; a++)
    for (let b = 0; b < nz; b++) {
      const c = topV[a][b], d = topV[a + 1][b], e = topV[a + 1][b + 1], f = topV[a][b + 1];
      const mid = c.clone().add(e).multiplyScalar(0.5);
      const n = noise3(mid.x * 0.9 + spec.seed % 97, 0, mid.z * 0.9, spec.seed);
      let cc = mulRGB(pal.cap, 0.9 + rnd() * 0.16);
      if (pal.snow && n > 0.55) cc = mulRGB(pal.snow, 0.96 + rnd() * 0.04);
      mb.quad(c, d, e, f, cc, V(0, 1, 0));
    }
  // cracks on crumbling rock: thin dark slivers just above the surface
  if (pal.crack) {
    for (let k = 0; k < 3; k++) {
      let x = -hx * 0.6 + rnd() * hx * 1.2, z = -hz * 0.8 + rnd() * hz * 0.4;
      for (let s = 0; s < 4; s++) {
        const nx2 = Math.max(-hx * 0.9, Math.min(hx * 0.9, x + (rnd() - 0.5) * 0.7)), nz2 = Math.max(-hz * 0.9, Math.min(hz * 0.9, z + hz * 0.35));
        mb.tri(V(x, 0.035, z), V(nx2 + 0.03, 0.035, nz2), V(nx2 - 0.03, 0.035, nz2), pal.crack, V(0, 1, 0));
        x = nx2; z = nz2;
      }
    }
  }

  // ---------------------------------------------------------------- sides: perimeter rings going down, insetting
  // perimeter at the top edge (counter-clockwise seen from above), each point with its inward direction
  const per: { p: THREE.Vector3; inward: THREE.Vector3; inner: boolean }[] = [];
  const pushEdge = (x0: number, z0: number, x1: number, z1: number, inward: THREE.Vector3, inner: boolean) => {
    const len = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.round(len / 0.5));
    for (let k = 0; k < n; k++) per.push({ p: V(x0 + (x1 - x0) * k / n, 0, z0 + (z1 - z0) * k / n), inward, inner });
  };
  pushEdge(hx, -hz, hx, hz, V(-1, 0, 0), false);        // outer face
  pushEdge(hx, hz, -hx, hz, V(0, 0, -1), false);        // +z side
  pushEdge(-hx, hz, -hx, -hz, V(1, 0, 0), true);        // inner face (against the cliff)
  pushEdge(-hx, -hz, hx, -hz, V(0, 0, 1), false);       // -z side
  const N = per.length;

  const depth = size.y;
  const ringsY = [0, -0.12, ...Array.from({ length: Math.max(1, Math.round(depth / 0.6)) }, (_, k) => -0.12 - (depth - 0.12) * (k + 1) / Math.max(1, Math.round(depth / 0.6)))];
  const rings: THREE.Vector3[][] = [];
  ringsY.forEach((y, r) => {
    const t = -y / Math.max(0.01, depth);
    rings.push(per.map(({ p, inward, inner }) => {
      if (r === 0) return p.clone();
      let inset = 0.05 + t * (sharp ? 0.35 : 0.22) + rnd() * (sharp ? 0.18 : 0.1);
      if (inner) inset = -t * 0.7;                       // inner face slopes back INTO the mountain (hidden there)
      const q = p.clone().addScaledVector(inward, inset);
      // keep corners inside the footprint along the other axis too
      q.z = Math.max(-hz + inset * 0.6, Math.min(hz - inset * 0.6, q.z));
      if (!inner) q.x = Math.min(q.x, hx - (Math.abs(inward.x) > 0 ? inset : inset * 0.5));
      q.y = y + (r > 1 ? (rnd() - 0.5) * 0.12 : 0);
      return q;
    }));
  });
  for (let r = 0; r < rings.length - 1; r++) {
    const band = mulRGB(pal.side, 0.95 - r * 0.03 + (r % 2) * 0.05);
    for (let k = 0; k < N; k++) {
      const a = rings[r][k], b = rings[r][(k + 1) % N], c = rings[r + 1][(k + 1) % N], d = rings[r + 1][k];
      const out = a.clone().add(b).multiplyScalar(0.5); out.y = 0;
      const cc = mulRGB(band, 0.9 + rnd() * 0.2);
      mb.tri(a, b, c, cc, out); mb.tri(a, c, d, cc, out);
    }
  }

  // ---------------------------------------------------------------- underside: taper back into the cliff
  const bottom = rings[rings.length - 1];
  const apex = V(-hx - 0.5, -depth - 0.6 - size.x * 0.45, 0);
  const under = mulRGB(pal.side, 0.7);
  for (let k = 0; k < N; k++) mb.tri(bottom[k], bottom[(k + 1) % N], apex, mulRGB(under, 0.9 + rnd() * 0.2), V(0, -1, 0));

  // ---------------------------------------------------------------- crystal ledge: hanging crystals
  if (pal.crystal) {
    for (let k = 0; k < 5; k++) {
      const p = V(-hx * 0.2 + rnd() * hx * 0.9, -depth * 0.6, (rnd() - 0.5) * hz * 1.4);
      mb.coneAxis(p, V((rnd() - 0.5) * 0.4, -1, (rnd() - 0.5) * 0.4), 0.12 + rnd() * 0.1, 0.5 + rnd() * 0.6, col(0.62, 0.55, 1), 5);
    }
  }
  return mb;
}
