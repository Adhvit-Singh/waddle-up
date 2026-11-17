import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateMountain } from '../src/world/MountainData.ts';
import { buildLedgeVisual, isRocky } from '../src/world/LedgeVisual.ts';

const m = generateMountain();
const rocky = m.ledges.filter(l => isRocky(l.kind));

test('most ledges are now rocky outcrops (normal, rest, wall, beam, ice, crumble, blink)', () => {
  assert.ok(rocky.length > 200, `${rocky.length} rocky ledges`);
});

test('the visible top of every rocky ledge is exactly the walkable rectangle (fair edges)', () => {
  for (const l of rocky) {
    const p = buildLedgeVisual(l).positions();
    let minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9, maxY = -1e9;
    for (let i = 0; i < p.length; i += 3) {
      maxY = Math.max(maxY, p[i + 1]);
      if (p[i + 1] > -0.02) { minX = Math.min(minX, p[i]); maxX = Math.max(maxX, p[i]); minZ = Math.min(minZ, p[i + 2]); maxZ = Math.max(maxZ, p[i + 2]); }
    }
    const hx = l.size.x / 2, hz = l.size.z / 2;
    assert.ok(Math.abs(minX + hx) < 0.01 && Math.abs(maxX - hx) < 0.01, `ledge ${l.index} top x ${minX}..${maxX} vs ±${hx}`);
    assert.ok(Math.abs(minZ + hz) < 0.01 && Math.abs(maxZ - hz) < 0.01, `ledge ${l.index} top z ${minZ}..${maxZ} vs ±${hz}`);
    assert.ok(maxY <= 0.06, `ledge ${l.index} has visual above the surface (${maxY})`);
  }
});

test('no rocky ledge visual pokes outside its walkable footprint anywhere below (no fake edges)', () => {
  for (const l of rocky) {
    const p = buildLedgeVisual(l).positions();
    for (let i = 0; i < p.length; i += 3) {
      assert.ok(Math.abs(p[i + 2]) <= l.size.z / 2 + 0.01, `ledge ${l.index} z overhang`);
      assert.ok(p[i] <= l.size.x / 2 + 0.01, `ledge ${l.index} pokes out past its outer edge`);
    }
  }
});
