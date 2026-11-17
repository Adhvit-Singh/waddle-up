import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Time } from '../src/core/time.ts';
import { Scheduler } from '../src/core/coroutines.ts';

function advance(dt: number) { Time.deltaTime = dt; Time.unscaledDeltaTime = dt; Time.time += dt; Time.unscaledTime += dt; Scheduler.update(); }

test('coroutine waits scaled seconds', () => {
  const owner = {}; let done = false;
  Scheduler.start(owner, (function* () { yield 0.5; done = true; })());
  advance(0.3); assert.equal(done, false);
  advance(0.3); assert.equal(done, true);
});
test('stopAll prevents resumption', () => {
  const owner = {}; let done = false;
  Scheduler.start(owner, (function* () { yield 0.1; done = true; })());
  Scheduler.stopAll(owner);
  advance(1); assert.equal(done, false);
});
test('null yield waits one frame; nested generator runs inline', () => {
  const owner = {}; const log: string[] = [];
  function* inner() { log.push('i1'); yield null; log.push('i2'); }
  Scheduler.start(owner, (function* () { log.push('a'); yield* inner(); log.push('b'); })());
  assert.deepEqual(log, ['a', 'i1']);
  advance(0.016); assert.deepEqual(log, ['a', 'i1', 'i2', 'b']);
});
