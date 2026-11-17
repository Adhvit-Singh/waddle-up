import { test } from 'node:test';
import assert from 'node:assert/strict';
import { onEscape, resumeDodges, shouldPauseOnUnlock } from '../src/core/pauseRules.ts';

const ui = (backHandled: boolean) => ({ calls: [] as string[], back() { this.calls.push('back'); return backHandled; }, creditsActive: false, endCredits() { this.calls.push('credits'); } });

test('Esc while playing pauses', () => {
  const u = ui(false); const p: boolean[] = [];
  onEscape('playing', u, on => p.push(on));
  assert.deepEqual(p, [true]);
});
test('Esc while paused never unpauses (only the RESUME button does)', () => {
  const u = ui(false); const p: boolean[] = [];
  onEscape('paused', u, on => p.push(on));
  assert.deepEqual(p, []);
  assert.deepEqual(u.calls, ['back']);
});
test('Esc while paused still closes settings / how-to / confirm', () => {
  const u = ui(true); const p: boolean[] = [];
  onEscape('paused', u, on => p.push(on));
  assert.deepEqual(u.calls, ['back']); assert.deepEqual(p, []);
});
test('RESUME always dodges 4 to 7 times', () => {
  for (const r of [0, 0.2, 0.5, 0.74, 0.99, 0.9999]) { const n = resumeDodges(r); assert.ok(n >= 4 && n <= 7 && Number.isInteger(n), String(n)); }
  assert.equal(resumeDodges(0), 4); assert.equal(resumeDodges(0.9999), 7);
});
test('losing the mouse pauses the game, except while the local dev menu holds it free', () => {
  assert.equal(shouldPauseOnUnlock(true, true, false), true);
  assert.equal(shouldPauseOnUnlock(true, true, true), false);
  assert.equal(shouldPauseOnUnlock(false, true, false), false);
  assert.equal(shouldPauseOnUnlock(true, false, false), false);
});
