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
