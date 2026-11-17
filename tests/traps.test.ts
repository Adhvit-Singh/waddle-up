import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TrapDirector } from '../src/trolls/TrapDirector.ts';
import { refs } from '../src/core/refs.ts';
import { Time } from '../src/core/time.ts';

function ledge(index: number, stage = 5) {
  return { index, stage, kind: 0, canCrumble: true, isIcy: false, isDynamic: false, crumbles: 0,
    crumble() { this.crumbles++; }, makeIcy() {}, scoot() {}, position: { x: 0, y: 0, z: 0 } } as never;
}

function setup() {
  refs.game = { isPlaying: true, currentStage: 5, sendToBottom() {}, data: { trapsTriggered: 0 } } as never;
  const td = new TrapDirector(i => (i >= 0 && i < 100 ? ledge(i) : null));
  Time.time = 100;
  return td;
}

test('a fall within 5s of a trap bans that trap at that ledge and grants grace', () => {
  const td = setup();
  const realRandom = Math.random; Math.random = () => 0; // always fire, always pick the first candidate (Crumble)
  try {
    td.onLanded(ledge(40), 2);
    assert.equal(td.trapsFired, 1);
    Time.time += 2;
    td.onFell(10);
    assert.equal(td.isBanned(40, 'Crumble'), true);
    assert.deepEqual(td.exportBans(), ['40:Crumble']);
    // next landing on 40 is free (grace), even with cooldown passed
    Time.time += 30;
    td.onLanded(ledge(41), 2); // different ledge resets lastLandIndex
    const fired = td.trapsFired;
    Time.time += 30;
    td.onLanded(ledge(40), 2);
    assert.equal(td.trapsFired, fired);
  } finally { Math.random = realRandom; }
});

test('external traps (sweepers, springs) never cause bans', () => {
  const td = setup();
  td.registerExternalTrap('sweeper');
  Time.time += 1;
  td.onFell(20);
  assert.deepEqual(td.exportBans(), []);
});

test('loadBans restores the banned list', () => {
  const td = setup();
  td.loadBans(['7:Gust', '9:Ice']);
  assert.equal(td.isBanned(7, 'Gust'), true);
  assert.equal(td.isBanned(9, 'Ice'), true);
});

// ---------------------------------------------------------------- round 2 rules
import { SaveSystem, normalizeSave } from '../src/core/SaveSystem.ts';

test('trap chance: none on stage 1, 30% at stage 2 rising to 80% at stage 20', () => {
  assert.equal(TrapDirector.chanceFor(0), 0);
  assert.ok(Math.abs(TrapDirector.chanceFor(1) - 0.30) < 1e-9);
  assert.ok(Math.abs(TrapDirector.chanceFor(19) - 0.80) < 1e-9);
});

test('a trap never fires twice at the same ledge in one game', () => {
  const td = setup();
  const realRandom = Math.random; Math.random = () => 0;
  try {
    td.onLanded(ledge(40), 2);
    const first = td.lastFired!;
    assert.equal(first.ledge, 40);
    Time.time += 30; td.onLanded(ledge(41), 2);
    Time.time += 30; td.onLanded(ledge(40), 2);
    assert.notEqual(td.lastFired!.type, first.type);
    assert.ok(td.exportFired().includes(`40:${first.type}`));
  } finally { Math.random = realRandom; }
});

test("last game's (ledge, trap) pairs are avoided in the next game", () => {
  const td = setup();
  const realRandom = Math.random; Math.random = () => 0;
  try {
    td.loadRun([], [], ['40:Crumble']);
    td.onLanded(ledge(40), 2);
    assert.notEqual(td.lastFired!.type, 'Crumble');
  } finally { Math.random = realRandom; }
});

test('endRun stores this game\'s fired traps for the next game', () => {
  const m = new Map<string, string>();
  SaveSystem.setStorage({ getItem: k => m.get(k) ?? null, setItem: (k, v) => { m.set(k, v); }, removeItem: k => { m.delete(k); } } as never);
  const td = setup();
  td.loadRun([], ['7:Gust', '9:Ice'], []);
  td.endRun();
  assert.deepEqual(SaveSystem.lastRunTraps, ['7:Gust', '9:Ice']);
});

test('saves remember fired traps (old saves default to [])', () => {
  assert.deepEqual(normalizeSave({} as never).firedTraps, []);
});

test('the cooldown between traps is 2 seconds', () => {
  const td = setup();
  const realRandom = Math.random; Math.random = () => 0;
  try {
    td.onLanded(ledge(40), 2); const n = td.trapsFired;
    Time.time += 1.9; td.onLanded(ledge(41), 2); assert.equal(td.trapsFired, n);
    Time.time += 0.2; td.onLanded(ledge(42), 2); assert.equal(td.trapsFired, n + 1);
  } finally { Math.random = realRandom; }
});

test('Gust and Seagull keep their round-2 chance per ledge; the other traps share the rest of the (higher) chance', () => {
  const td = setup();
  for (const stage of [1, 5, 12, 19]) {
    const l = ledge(60 + stage, stage);
    const p = td.probabilities(l);
    // round-2 rule: chance lerp(0.10, 0.45) split by weight across all candidates
    const old = td.legacyProbabilities(l);
    for (const keep of ['Gust', 'Seagull'] as const) assert.ok(Math.abs((p[keep] ?? 0) - (old[keep] ?? 0)) < 1e-9, `${keep} at stage ${stage}`);
    const total = Object.values(p).reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(total - TrapDirector.chanceFor(stage)) < 1e-9, `total at stage ${stage}`);
    for (const [k, v] of Object.entries(p)) if (k !== 'Gust' && k !== 'Seagull') assert.ok(v >= (old[k as never] ?? 0) - 1e-12, `${k} must not get rarer`);
  }
});
