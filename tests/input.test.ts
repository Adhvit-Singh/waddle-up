import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MouseSpikeFilter } from '../src/core/mouseFilter.ts';

test('normal slow and fast mouse movement passes through unchanged', () => {
  const f = new MouseSpikeFilter();
  for (const dx of [1, 2, 3, 5, 8, 20, 40, 80, 120, 150, 120, 60]) assert.deepEqual(f.filter(dx, 1), { x: dx, y: 1 });
});
test('a sudden huge jump out of slow movement is dropped (browser pointer-lock glitch)', () => {
  const f = new MouseSpikeFilter();
  for (let i = 0; i < 10; i++) f.filter(3, 0);
  assert.deepEqual(f.filter(-640, 12), { x: 0, y: 0 });
  assert.deepEqual(f.filter(4, 0), { x: 4, y: 0 }); // next normal event is fine
});
test('a sustained fast flick is not mistaken for a glitch', () => {
  const f = new MouseSpikeFilter();
  const out = [10, 60, 180, 320, 380, 300].map(dx => f.filter(dx, 0).x);
  assert.deepEqual(out, [10, 60, 180, 320, 380, 300]);
});
