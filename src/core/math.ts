import * as THREE from 'three';

export const Deg2Rad = Math.PI / 180;
export const Rad2Deg = 180 / Math.PI;

export const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
export const clamp01 = (v: number) => clamp(v, 0, 1);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * clamp01(t);
export const lerpUnclamped = (a: number, b: number, t: number) => a + (b - a) * t;
export const inverseLerp = (a: number, b: number, v: number) => (a !== b ? clamp01((v - a) / (b - a)) : 0);
export const repeat = (t: number, len: number) => clamp(t - Math.floor(t / len) * len, 0, len);
export const smoothStep = (from: number, to: number, t: number) => { t = clamp01(t); t = -2 * t * t * t + 3 * t * t; return to * t + from * (1 - t); };
export const moveTowards = (cur: number, target: number, maxDelta: number) =>
  Math.abs(target - cur) <= maxDelta ? target : cur + Math.sign(target - cur) * maxDelta;
export const deltaAngle = (cur: number, target: number) => { let d = repeat(target - cur, 360); if (d > 180) d -= 360; return d; };
export const moveTowardsAngle = (cur: number, target: number, maxDelta: number) => {
  const d = deltaAngle(cur, target);
  if (-maxDelta < d && d < maxDelta) return target;
  return moveTowards(cur, cur + d, maxDelta);
};
export const sign = (v: number) => (v >= 0 ? 1 : -1); // Unity Mathf.Sign(0) == 1

export const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
export const UP = Object.freeze(new THREE.Vector3(0, 1, 0)) as THREE.Vector3;
export const FORWARD = Object.freeze(new THREE.Vector3(0, 0, 1)) as THREE.Vector3;
export const RIGHT = Object.freeze(new THREE.Vector3(1, 0, 0)) as THREE.Vector3;

/** Vector3.MoveTowards */
export function moveTowardsV(cur: THREE.Vector3, target: THREE.Vector3, maxDelta: number, out = new THREE.Vector3()) {
  const d = out.copy(target).sub(cur);
  const len = d.length();
  if (len <= maxDelta || len === 0) return out.copy(target);
  return out.copy(cur).addScaledVector(d, maxDelta / len);
}

/** Vector3.RotateTowards (magnitude delta ignored for unit vectors) */
export function rotateTowards(cur: THREE.Vector3, target: THREE.Vector3, maxRad: number, out = new THREE.Vector3()) {
  const a = cur.clone().normalize(), b = target.clone().normalize();
  const angle = a.angleTo(b);
  if (angle <= maxRad || angle < 1e-6) return out.copy(b);
  const axis = new THREE.Vector3().crossVectors(a, b);
  if (axis.lengthSq() < 1e-10) axis.set(0, 1, 0); else axis.normalize();
  return out.copy(a).applyAxisAngle(axis, maxRad);
}

/** Quaternion.Euler in degrees (Unity order Z, X, Y => three 'YXZ'). */
export function eulerDeg(x: number, y: number, z: number, out = new THREE.Quaternion()) {
  return out.setFromEuler(new THREE.Euler(x * Deg2Rad, y * Deg2Rad, z * Deg2Rad, 'YXZ'));
}

/** Quaternion.LookRotation: local +Z -> forward, +Y -> up (same matrix as Unity). */
export function lookRotation(forward: THREE.Vector3, up: THREE.Vector3 = UP, out = new THREE.Quaternion()) {
  const z = forward.clone().normalize();
  if (z.lengthSq() < 1e-10) return out.identity();
  let x = new THREE.Vector3().crossVectors(up, z);
  if (x.lengthSq() < 1e-10) x = new THREE.Vector3().crossVectors(Math.abs(z.y) < 0.99 ? UP : RIGHT, z);
  x.normalize();
  const y = new THREE.Vector3().crossVectors(z, x);
  return out.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
}

/** yaw (degrees) of a direction, like Mathf.Atan2(f.x, f.z) * Rad2Deg */
export const yawOf = (f: THREE.Vector3) => Math.atan2(f.x, f.z) * Rad2Deg;
/** Quaternion.Euler(0, yaw, 0) * forward */
export const dirFromYaw = (yawDeg: number) => new THREE.Vector3(Math.sin(yawDeg * Deg2Rad), 0, Math.cos(yawDeg * Deg2Rad));

export function projectOnPlaneUp(v: THREE.Vector3) { return new THREE.Vector3(v.x, 0, v.z); }

/** Unity Color * k (rgb only, alpha untouched) */
export const mulRGB = (c: THREE.Color, k: number) => new THREE.Color(c.r * k, c.g * k, c.b * k);
export const lerpColor = (a: THREE.Color, b: THREE.Color, t: number) => a.clone().lerp(b, clamp01(t));

/** Unity `new Color(r,g,b)` — raw values, used as-is (linear), exactly like Unity vertex colors. */
export const col = (r: number, g: number, b: number) => new THREE.Color().setRGB(r, g, b, THREE.LinearSRGBColorSpace);
/** ColorUtility.TryParseHtmlString — raw byte/255 values, no gamma conversion. */
export function hexCol(hex: string) {
  const h = hex.replace('#', '');
  return col(parseInt(h.slice(0, 2), 16) / 255, parseInt(h.slice(2, 4), 16) / 255, parseInt(h.slice(4, 6), 16) / 255);
}
export const WHITE = () => col(1, 1, 1);
export const BLACK = () => col(0, 0, 0);
/** Unity material / light / fog colors are authored in gamma space and converted — same as three's sRGB input. */
export const srgb = (r: number, g: number, b: number) => new THREE.Color().setRGB(r, g, b, THREE.SRGBColorSpace);
/** Unity UI Color(r,g,b,a) → CSS color string */
export const css = (r: number, g: number, b: number, a = 1) =>
  `rgba(${Math.round(Math.min(1, r) * 255)},${Math.round(Math.min(1, g) * 255)},${Math.round(Math.min(1, b) * 255)},${a})`;
