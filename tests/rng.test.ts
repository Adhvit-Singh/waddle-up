import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DotNetRandom } from '../src/core/rng.ts';

test('DotNetRandom(0).next() matches .NET', () => {
  assert.equal(new DotNetRandom(0).next(), 1559595546);
});
test('DotNetRandom(42).next() matches .NET', () => {
  assert.equal(new DotNetRandom(42).next(), 1434747710);
});
test('DotNetRandom(42).nextDouble() matches .NET', () => {
  assert.ok(Math.abs(new DotNetRandom(42).nextDouble() - 0.6681064659115423) < 1e-12);
});
test('next(max) stays in range', () => {
  const r = new DotNetRandom(7);
  for (let i = 0; i < 1000; i++) { const v = r.next(5); assert.ok(v >= 0 && v < 5 && Number.isInteger(v)); }
});
