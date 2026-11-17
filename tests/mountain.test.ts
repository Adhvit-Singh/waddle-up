import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateMountain } from '../src/world/MountainData.ts';
import { LedgeKind } from '../src/core/StageData.ts';

const m = generateMountain();

test('same ledge count as Unity (299)', () => assert.equal(m.ledges.length, 299));
test('tier tops match Unity (~80 / 156 / 227 m)', () => {
  const tops = m.tiers.map(t => t.topY);
  [80, 156, 227].forEach((want, i) => assert.ok(Math.abs(tops[i] - want) < 1.5, `tier ${i} top ${tops[i]}`));
});
test('51 wall climbs and 34 beams like Unity', () => {
  assert.equal(m.ledges.filter(l => l.kind === LedgeKind.Wall).length, 51);
  assert.equal(m.ledges.filter(l => l.kind === LedgeKind.Beam).length, 34);
});
test('spawn is on the first (rest) ledge', () => {
  assert.equal(m.ledges[0].kind, LedgeKind.Rest);
  assert.ok(m.spawnPoint.distanceTo(m.ledges[0].pos.clone().setY(m.ledges[0].pos.y + 0.05)) < 1e-6);
});

// ---------------------------------------------------------------- round 2: natural mountain
import * as THREE from 'three';


test('every jump is identical to the original climb (same rise, same gap, same ledge sizes)', async () => {
  const { readFileSync } = await import('node:fs');
  const want = JSON.parse(readFileSync(new URL('./fixtures/jumps.json', import.meta.url), 'utf8'));
  const L = m.ledges;
  for (let i = 1; i < L.length; i++) {
    const w = want[i - 1], a = L[i - 1], b = L[i];
    if (!w) { assert.notEqual(a.tier, b.tier); continue; }
    const r = Math.hypot(b.pos.x, b.pos.z);
    let dth = Math.atan2(b.pos.z, b.pos.x) - Math.atan2(a.pos.z, a.pos.x); dth = Math.atan2(Math.sin(dth), Math.cos(dth));
    const gap = dth * r - a.size.z / 2 - b.size.z / 2;
    assert.ok(Math.abs(b.pos.y - a.pos.y - w.rise) < 1e-9, `rise ${i}`);
    assert.ok(Math.abs(gap - w.gap) < 1e-6, `gap ${i}: ${gap} vs ${w.gap}`);
    assert.equal(b.kind, w.kind);
    assert.deepEqual([b.size.x, b.size.y, b.size.z], w.size);
  }
});

function tris(tier: number) {
  const p = m.bodies.find(b => b.tier === tier)!.mesh.positions();
  const out: THREE.Vector3[][] = [];
  for (let i = 0; i < p.length; i += 9) out.push([0, 3, 6].map(k => new THREE.Vector3(p[i + k], p[i + k + 1], p[i + k + 2])));
  return out;
}

test('corridor clear: no rock sticks out into any ledge\'s jump space or headroom', () => {
  let worst = 0, where = '';
  for (const c of m.corridors) {
    const tier = m.tiers[c.tier];
    for (const t of tris(c.tier)) {
      const samples = [...t, t[0].clone().add(t[1]).multiplyScalar(0.5), t[1].clone().add(t[2]).multiplyScalar(0.5), t[0].clone().add(t[2]).multiplyScalar(0.5), t[0].clone().add(t[1]).add(t[2]).divideScalar(3)];
      for (const s of samples) {
        if (s.y < c.yMin || s.y > c.yMax) continue;
        let d = Math.atan2(s.z, s.x) - c.angle; d = Math.atan2(Math.sin(d), Math.cos(d));
        if (Math.abs(d) > c.halfSpan) continue;
        const over = Math.hypot(s.x, s.z) - (tier.slopeR(s.y) + 0.1);
        if (over > worst) { worst = over; where = `ledge ${c.ledge} y ${s.y.toFixed(1)}`; }
      }
    }
  }
  assert.ok(worst <= 1e-4, `rock pokes ${worst.toExponential(2)} m into the path at ${where}`);
});

test('no stuck spots: off the summit plateaus and the ground ring, all rock is too steep to stand on', () => {
  let flat = 0, example = '';
  for (const tier of m.tiers) for (const t of tris(tier.index)) {
    const y = (t[0].y + t[1].y + t[2].y) / 3;
    if (y > tier.topY - 0.5 || y < tier.baseY + (tier.index === 0 ? 0.5 : -100)) continue;  // plateau cap / ground ring
    if (tier.index > 0 && y < m.tiers[tier.index - 1].topY + 0.5) continue;                  // hidden inside the tier below
    const n = new THREE.Vector3().crossVectors(t[1].clone().sub(t[0]), t[2].clone().sub(t[0])).normalize();
    if (Math.abs(n.y) > 0.6 && n.y > 0) { flat++; example = `tier ${tier.index} y ${y.toFixed(1)} n.y ${n.y.toFixed(2)}`; }
  }
  assert.equal(flat, 0, `walkable rock triangles off-path: ${flat} (e.g. ${example})`);
});

test('mountain stays light enough to render fast', () => {
  for (const b of m.bodies) assert.ok(b.mesh.vertexCount / 3 < 60000, `tier ${b.tier}: ${b.mesh.vertexCount / 3} tris`);
  for (const b of m.bodies) assert.ok(b.mesh.vertexCount / 3 > 3000, `tier ${b.tier} still low detail`);
});

// these 3 tight spots exist in the original Unity layout (top tier, unchanged); reported to the user, not silently changed
const KNOWN_UNITY_TIGHT = new Set(['254/241', '259/247', '259/248']);

test('headroom: no ledge hangs lower than 2.6 m above a ledge it overlaps (penguin 1.12 m + jump 1.43 m)', () => {
  let worst = 99, where = '';
  const span = (l: (typeof m.ledges)[number]) => {
    const r = Math.hypot(l.pos.x, l.pos.z), a = Math.atan2(l.pos.z, l.pos.x), h = (l.size.z / 2 + l.size.x * 0.3) / r;
    return [a - h, a + h];
  };
  for (const a of m.ledges) for (const b of m.ledges) {
    if (a.tier !== b.tier || b.pos.y <= a.pos.y || Math.abs(b.index - a.index) <= 3) continue; // path neighbours sit side by side
    const [a0, a1] = span(a), [b0, b1] = span(b);
    const overlap = [-2 * Math.PI, 0, 2 * Math.PI].some(k => b0 + k < a1 && b1 + k > a0);
    if (!overlap) continue;
    const clear = (b.pos.y - b.size.y) - a.pos.y;
    if (KNOWN_UNITY_TIGHT.has(`${b.index}/${a.index}`)) continue;
    if (clear < worst) { worst = clear; where = `ledge ${b.index} over ${a.index}`; }
  }
  assert.ok(worst >= 2.6, `only ${worst.toFixed(2)} m clearance (${where})`);
});
