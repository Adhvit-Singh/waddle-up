import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { moveTowardsV } from '../src/core/math.ts';

const near = (a: THREE.Vector3, b: THREE.Vector3) => assert.ok(a.distanceTo(b) < 1e-9, `${a.toArray()} != ${b.toArray()}`);

test('moveTowardsV steps toward the target like Unity Vector3.MoveTowards', () => {
  const r = moveTowardsV(new THREE.Vector3(4, 0, 0), new THREE.Vector3(0, 0, 4), 1);
  near(r, new THREE.Vector3(4 - Math.SQRT1_2, 0, Math.SQRT1_2));
});
test('moveTowardsV never increases speed past both endpoints (no air launch)', () => {
  let v = new THREE.Vector3(4.54, 0, 0);
  const target = new THREE.Vector3(4.6 * 0.64, 0, 4.6 * Math.sqrt(1 - 0.64 * 0.64));
  for (let i = 0; i < 50; i++) { v = moveTowardsV(v, target, 0.18); assert.ok(v.length() <= 4.6 + 1e-9, `speed ${v.length()}`); }
  near(v, target);
});
test('moveTowardsV works when out is the same vector as cur (ground relVel update)', () => {
  const v = new THREE.Vector3(0, 0, 0);
  moveTowardsV(v, new THREE.Vector3(4.6, 0, 0), 0.76, v);
  near(v, new THREE.Vector3(0.76, 0, 0));
  moveTowardsV(v, new THREE.Vector3(4.6, 0, 0), 0.76, v);
  near(v, new THREE.Vector3(1.52, 0, 0));
});
