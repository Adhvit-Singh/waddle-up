import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FixedStepper } from '../src/core/time.ts';

test('huge frame delta is clamped to at most 5 fixed steps', () => {
  const s = new FixedStepper(0.02);
  assert.ok(s.stepsFor(5) <= 5);
});
test('normal frame accumulates', () => {
  const s = new FixedStepper(0.02);
  assert.equal(s.stepsFor(0.05), 2);
  assert.equal(s.stepsFor(0.01), 1);
});
