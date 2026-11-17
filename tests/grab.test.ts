import { test } from 'node:test';
import assert from 'node:assert/strict';
import { grabAllowed } from '../src/player/grabRule.ts';

test('you can grab the next ledge or the one after (normal climbing, walls)', () => {
  assert.equal(grabAllowed(41, 40), true);
  assert.equal(grabAllowed(42, 40), true);
});
test('you cannot grab a ledge more than 2 ahead of the last ledge you stood on (no skipping a loop)', () => {
  assert.equal(grabAllowed(43, 40), false);
  assert.equal(grabAllowed(52, 40), false);
});
test('grabbing lower ledges (after a fall) and non-ledge rock is always fine', () => {
  assert.equal(grabAllowed(12, 40), true);
  assert.equal(grabAllowed(null, 40), true);
});
test('right after a teleport (unknown last ledge) grabbing is allowed', () => {
  assert.equal(grabAllowed(90, -1), true);
});
