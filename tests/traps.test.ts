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
