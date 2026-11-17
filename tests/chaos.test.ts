import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chaosDuration, ChaosMode } from '../src/trolls/ControlChaos.ts';

test('every control flip (inverted, mirrored, rotated 90°) lasts twice as long as before', () => {
  for (const mode of [ChaosMode.Inverted, ChaosMode.Mirrored, ChaosMode.Rotated])
    for (const [r, s01] of [[0, 0], [1, 0], [0.5, 1]]) assert.ok(Math.abs(chaosDuration(mode, r, s01) - (12 + r * 6 + s01 * 8) * 2) < 1e-9);
});
