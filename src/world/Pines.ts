import * as THREE from 'three';
import { UP } from '../core/math.ts';
import { noise3 } from './noise.ts';
import { Props } from './Props.ts';
import { Mats } from './MeshKit.ts';
import { instanced } from './WorldDecor.ts';
import type { MountainData } from './MountainData.ts';
import type { TierRuntime } from './MountainGenerator.ts';

/**
 * Small pines growing on the mountain's gentler rock faces, away from the trail. Decoration only: no collider,
 * so they never block a jump, a fall or the camera. They live under their tier's root, so they rise with it.
 * Fewer higher up; none on the icy top tier.
 */
export function buildPines(data: MountainData, tiers: TierRuntime[]) {
  const shapes = [0, 1, 2].map(i => Props.treeMesh(900 + i, 0.55 + i * 0.12).build());
  const tmp = { a: new THREE.Vector3(), b: new THREE.Vector3(), c: new THREE.Vector3(), n: new THREE.Vector3() };
  const counts: number[] = [];
  for (const body of data.bodies) {
    const t = body.tier;
    if (t >= 2) { counts.push(0); continue; }
    const tier = tiers[t];
    const corridors = data.corridors.filter(c => c.tier === t);
    const mats: THREE.Matrix4[][] = shapes.map(() => []);
    const cands: { score: number; k: number; m: THREE.Matrix4 }[] = [];
    const p = body.mesh.positions();
    let n = 0;
    for (let i = 0; i < p.length; i += 9) {
      tmp.a.set(p[i], p[i + 1], p[i + 2]); tmp.b.set(p[i + 3], p[i + 4], p[i + 5]); tmp.c.set(p[i + 6], p[i + 7], p[i + 8]);
      const cx = (tmp.a.x + tmp.b.x + tmp.c.x) / 3, cy = (tmp.a.y + tmp.b.y + tmp.c.y) / 3, cz = (tmp.a.z + tmp.b.z + tmp.c.z) / 3;
      if (cy < tier.baseY + 3 || cy > tier.topY - 4) continue;
      if (t > 0 && cy < tiers[t - 1].topY + 2) continue;                          // hidden inside the tier below
      tmp.n.crossVectors(tmp.b.clone().sub(tmp.a), tmp.c.clone().sub(tmp.a)).normalize();
      if (tmp.n.x * cx + tmp.n.z * cz < 0) tmp.n.negate();
      if (tmp.n.y < 0.32) continue;                                               // only the gentler faces
      const h01 = (cy - tier.baseY) / (tier.topY - tier.baseY);
      const keep = noise3(cx * 0.21, cy * 0.21, cz * 0.21, 4242 + t) * (1 - h01 * 0.85) * (t === 0 ? 1 : 0.6);
      if (keep < 0.3) continue;
      // stay well clear of the trail (no pine in front of a jump, even visually)
      const ang = Math.atan2(cz, cx);
      if (corridors.some(c => {
        if (cy < c.yMin - 1.5 || cy > c.yMax + 2) return false;
        let d = ang - c.angle; d = Math.atan2(Math.sin(d), Math.cos(d));
        return Math.abs(d) < c.halfSpan + 2.5 / Math.max(4, Math.hypot(cx, cz));
      })) continue;
      const s = 0.7 + noise3(cx, cy, cz, 77) * 0.8;
      const yaw = noise3(cz, cx, cy, 78) * Math.PI * 2;
      const k = Math.floor(noise3(cy, cz, cx, 79) * shapes.length) % shapes.length;
      // sink the trunk slightly into the rock, root on the centroid
      const pos = new THREE.Vector3(cx, cy - 0.15, cz).sub(tier.root.position);
      cands.push({ score: keep + noise3(cx * 3.1, cy * 3.1, cz * 3.1, 80) * 0.25, k, m: new THREE.Matrix4().compose(pos, new THREE.Quaternion().setFromAxisAngle(UP, yaw), new THREE.Vector3(s, s, s)) });
    }
    // a scattering, not a carpet: keep the best-placed few
    cands.sort((x, y) => y.score - x.score);
    for (const c of cands.slice(0, t === 0 ? 260 : 70)) { mats[c.k].push(c.m); n++; }
    shapes.forEach((g, k) => instanced('MountainPines', g, mats[k], tier.root, Mats.vertexColor));
    counts.push(n);
  }
  return counts;
}
