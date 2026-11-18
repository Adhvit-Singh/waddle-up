import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ROLES, roleById } from '../src/player/roles/Roles.ts';
import { normalizeSave } from '../src/core/SaveSystem.ts';
import { generateMountain, JUMP_V, MOVE_SPEED, G } from '../src/world/MountainData.ts';

test('8 roles, Normal first, unique ids', () => {
  assert.equal(ROLES.length, 8);
  assert.equal(ROLES[0].id, 'normal');
  assert.equal(new Set(ROLES.map(r => r.id)).size, 8);
});

test('every role has a proper description; every non-normal role has an advantage and a disadvantage', () => {
  for (const r of ROLES) {
    assert.ok(r.name.length > 3 && r.description.length >= 60, `${r.id} description`);
    if (r.id === 'normal') continue;
    assert.ok(r.plus.length >= 15, `${r.id} advantage`);
    assert.ok(r.minus.length >= 15, `${r.id} disadvantage`);
  }
});

test('Normal changes nothing', () => {
  const m = roleById('normal').mods;
  assert.deepEqual([m.speed, m.jump, m.gravity, m.grip, m.knockback], [1, 1, 1, 1, 1]);
  assert.equal(m.noStun, false);
});

test('saves remember the role; old or broken saves are Normal', () => {
  assert.equal(normalizeSave({} as never).role, 'normal');
  assert.equal(normalizeSave({ role: 'banana' } as never).role, 'normal');
  assert.equal(normalizeSave({ role: 'ghost' } as never).role, 'ghost');
});

// ---------------------------------------------------------------- beatable with every role
const m = generateMountain();
const H_GRAB = 2.05;   // auto-grab reaches this far above the feet
for (const role of ROLES) {
  const md = role.mods;
  const v = JUMP_V * md.jump, g = G * md.gravity, speed = MOVE_SPEED * md.speed;
  const peak = v * v / (2 * g);

  test(`${role.name}: every jump on the mountain is still makeable`, () => {
    const L = m.ledges;
    for (let i = 1; i < L.length; i++) {
      const a = L[i - 1], b = L[i];
      if (a.tier !== b.tier) continue;
      const rise = b.pos.y - a.pos.y;
      assert.ok(rise <= peak + H_GRAB - 0.3, `${role.id}: ledge ${i} rise ${rise.toFixed(2)} too high`);
      // horizontal reach landing at that height (or at grab height for tall steps)
      const land = Math.min(rise, peak - 0.05);
      const airT = (v + Math.sqrt(Math.max(0.01, v * v - 2 * g * land))) / g;
      const r = Math.hypot(b.pos.x, b.pos.z);
      let dth = Math.atan2(b.pos.z, b.pos.x) - Math.atan2(a.pos.z, a.pos.x); dth = Math.atan2(Math.sin(dth), Math.cos(dth));
      const gap = dth * r - a.size.z / 2 - b.size.z / 2;
      assert.ok(gap <= speed * airT * 0.92, `${role.id}: ledge ${i} gap ${gap.toFixed(2)} vs reach ${(speed * airT).toFixed(2)}`);
    }
  });

  test(`${role.name}: cannot land on a ledge more than 2 ahead (no new skips)`, () => {
    for (const a of m.ledges) for (const b of m.ledges) {
      if (a.tier !== b.tier || b.index <= a.index + 2) continue;
      const up = b.pos.y - a.pos.y;
      if (up <= 0.05 || up > peak) continue;
      const d = Math.max(0, Math.hypot(a.pos.x - b.pos.x, a.pos.z - b.pos.z) - Math.hypot(a.size.x, a.size.z) / 2 - Math.hypot(b.size.x, b.size.z) / 2);
      const airT = (v + Math.sqrt(Math.max(0.01, v * v - 2 * g * up))) / g;
      const fastest = speed * md.groundSpeed;   // take-off speed is kept in the air
      assert.ok(d > fastest * airT, `${role.id}: ${a.index} -> ${b.index}`);
    }
  });
}
