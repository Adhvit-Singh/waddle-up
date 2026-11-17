/** Small seeded 3D value noise + fractal helpers (deterministic, no dependencies). */

function hash3(x: number, y: number, z: number, seed: number) {
  let h = (x * 374761393 + y * 668265263 + z * 2147483647 + seed * 1442695041) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

const fade = (t: number) => t * t * (3 - 2 * t);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** value noise in [0,1] */
export function noise3(x: number, y: number, z: number, seed = 0) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = fade(x - xi), yf = fade(y - yi), zf = fade(z - zi);
  const c = (dx: number, dy: number, dz: number) => hash3(xi + dx, yi + dy, zi + dz, seed);
  return lerp(
    lerp(lerp(c(0, 0, 0), c(1, 0, 0), xf), lerp(c(0, 1, 0), c(1, 1, 0), xf), yf),
    lerp(lerp(c(0, 0, 1), c(1, 0, 1), xf), lerp(c(0, 1, 1), c(1, 1, 1), xf), yf),
    zf);
}

/** fractal noise in about [-1,1] */
export function fbm(x: number, y: number, z: number, octaves = 4, seed = 0) {
  let a = 0.5, f = 1, sum = 0, norm = 0;
  for (let i = 0; i < octaves; i++) { sum += (noise3(x * f, y * f, z * f, seed + i * 17) * 2 - 1) * a; norm += a; a *= 0.5; f *= 2.03; }
  return sum / norm;
}

/** ridged fractal noise in [0,1]: sharp crests, good for rock ribs */
export function ridged(x: number, y: number, z: number, octaves = 4, seed = 0) {
  let a = 0.5, f = 1, sum = 0, norm = 0;
  for (let i = 0; i < octaves; i++) {
    const n = 1 - Math.abs(noise3(x * f, y * f, z * f, seed + i * 31) * 2 - 1);
    sum += n * n * a; norm += a; a *= 0.5; f *= 2.1;
  }
  return sum / norm;
}
