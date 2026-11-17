import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stageGustStrength, trapGustStrength } from '../src/trolls/windStrength.ts';

test('windy-stage gusts are half as strong as before (was 9 + 0.45 × stage)', () => {
  for (const s of [7, 17]) assert.ok(Math.abs(stageGustStrength(s) - (9 + s * 0.45) * 0.5) < 1e-9);
});
test('the gust trap is half as strong as before (was 10 + 0.6 × stage)', () => {
  for (const s of [1, 10, 19]) assert.ok(Math.abs(trapGustStrength(s) - (10 + s * 0.6) * 0.5) < 1e-9);
});
