import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TrapDirector, NEW_TRAPS } from '../src/trolls/TrapDirector.ts';
import { TrapEffects } from '../src/trolls/TrapEffects.ts';
import { SaveSystem } from '../src/core/SaveSystem.ts';
import { refs } from '../src/core/refs.ts';
import { Time } from '../src/core/time.ts';
import { Scheduler } from '../src/core/coroutines.ts';

const MIN: Record<string, number> = { Seagull: 1, FallThrough: 2, Tilt: 2, SlipGrab: 3, CameraTroll: 4, InputDelay: 5, FakeCrash: 6, FakeSave: 7 };

function ledge(index: number, stage: number) {
  return { index, stage, kind: 0, canCrumble: true, isIcy: false, isDynamic: false, crumble() {}, makeIcy() {}, scoot() {}, ghost() {}, tilt() {},
    position: { x: 0, y: 0, z: 0, clone() { return this; } } } as never;
}
let stubStage = 10;
function director() {
  refs.game = { isPlaying: true, currentStage: 5, sendToBottom() {}, sendToStageStart() {}, data: { trapsTriggered: 0, inversions: 0 } } as never;
  const td = new TrapDirector(i => (i >= 0 && i < 299 ? ledge(i, stubStage) : null));
  Time.time = 1000;
  return td;
}

test('the 8 new traps exist with the agreed minimum stages', () => {
  assert.deepEqual(Object.fromEntries(NEW_TRAPS.map(d => [d.type, d.minStage])), MIN);
});

test('each new trap is only a candidate from its minimum stage on (stage index)', () => {
  const td = director();
  for (const [type, min] of Object.entries(MIN)) {
    stubStage = min - 1;
    assert.equal(td.candidateTypes(ledge(50, min - 1)).includes(type as never), false, `${type} below stage`);
    stubStage = min;
    assert.equal(td.candidateTypes(ledge(50, min)).includes(type as never), true, `${type} at stage`);
    stubStage = 10;
  }
});

test('fall-through never fires twice in a row', () => {
  const td = director();
  td.forceFire('FallThrough', ledge(60, 10));
  assert.equal(td.candidateTypes(ledge(61, 10)).includes('FallThrough'), false);
  td.forceFire('Seagull', ledge(62, 10));
  assert.equal(td.candidateTypes(ledge(63, 10)).includes('FallThrough'), true);
});

test('TrapEffects.reset ends input delay and camera trolls', () => {
  Time.unscaledTime = 50;
  TrapEffects.startInputDelay(4);
  assert.equal(TrapEffects.inputDelayActive, true);
  TrapEffects.reset();
  assert.equal(TrapEffects.inputDelayActive, false);
  assert.equal(TrapEffects.cameraTroll, null);
});

test('the fake save-corrupted trap never touches the real save', () => {
  const m = new Map<string, string>([['wu_save_v1', '{"px":1,"falls":3}']]);
  SaveSystem.setStorage({ getItem: k => m.get(k) ?? null, setItem: (k, v) => { m.set(k, v); }, removeItem: k => { m.delete(k); } } as never);
  const td = director();
  td.forceFire('FakeSave', ledge(70, 10));
  for (let i = 0; i < 400; i++) { Time.time += 0.02; Time.unscaledTime += 0.02; Scheduler.update(); }
  assert.equal(m.get('wu_save_v1'), '{"px":1,"falls":3}');
});
