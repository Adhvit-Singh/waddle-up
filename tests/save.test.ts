import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SaveSystem, newSaveData, normalizeSave } from '../src/core/SaveSystem.ts';

function memStorage(): Storage {
  const m = new Map<string, string>();
  return { get length() { return m.size; }, clear: () => m.clear(), getItem: k => m.get(k) ?? null, key: i => [...m.keys()][i] ?? null,
    removeItem: k => { m.delete(k); }, setItem: (k, v) => { m.set(k, String(v)); } };
}

test('save round-trips under key wu_save_v1', () => {
  const s = memStorage(); SaveSystem.setStorage(s);
  const d = newSaveData(); d.px = 1.5; d.falls = 7; d.bannedTraps = ['40:Crumble'];
  SaveSystem.save(d);
  assert.ok(s.getItem('wu_save_v1'));
  assert.equal(SaveSystem.hasSave, true);
  assert.deepEqual(SaveSystem.load(), d);
});
test('corrupt save loads as null', () => {
  const s = memStorage(); SaveSystem.setStorage(s);
  s.setItem('wu_save_v1', '{not json');
  assert.equal(SaveSystem.load(), null);
});
test('old save without bannedTraps normalizes to []', () => {
  const d = normalizeSave({ px: 1, py: 2, pz: 3 } as never);
  assert.deepEqual(d.bannedTraps, []);
  assert.equal(d.maxStage, 1);
});
test('lifetime stats use Unity keys', () => {
  const s = memStorage(); SaveSystem.setStorage(s);
  SaveSystem.wins = 3; SaveSystem.bestTime = 612.5; SaveSystem.lifetimeFalls = 9;
  assert.equal(s.getItem('wu_wins'), '3'); assert.equal(s.getItem('wu_besttime'), '612.5'); assert.equal(s.getItem('wu_lifefalls'), '9');
  SaveSystem.clear(); assert.equal(SaveSystem.hasSave, false);
});

test('a saved fall (air state) loads only if every number is valid', () => {
  const ok = { x: 1, y: 50, z: 2, vx: 3, vy: -9, vz: 0.5, peak: 55 };
  assert.deepEqual(normalizeSave({ air: ok } as never).air, ok);
  assert.equal(normalizeSave({ air: { ...ok, vy: NaN } } as never).air, null);
  assert.equal(normalizeSave({ air: 'nope' } as never).air, null);
  assert.equal(normalizeSave({} as never).air, null);
});
