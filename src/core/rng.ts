/** Exact port of .NET / Mono System.Random(int seed) (Knuth subtractive generator). */
const MBIG = 2147483647;
const MSEED = 161803398;

export class DotNetRandom {
  private seedArray = new Array<number>(56).fill(0);
  private inext = 0;
  private inextp = 21;

  constructor(seed: number) {
    seed = seed | 0;
    const subtraction = seed === -2147483648 ? MBIG : Math.abs(seed);
    let mj = MSEED - subtraction;
    this.seedArray[55] = mj;
    let mk = 1;
    for (let i = 1; i < 55; i++) {
      const ii = (21 * i) % 55;
      this.seedArray[ii] = mk;
      mk = mj - mk;
      if (mk < 0) mk += MBIG;
      mj = this.seedArray[ii];
    }
    for (let k = 1; k < 5; k++) {
      for (let i = 1; i < 56; i++) {
        this.seedArray[i] -= this.seedArray[1 + ((i + 30) % 55)];
        if (this.seedArray[i] < 0) this.seedArray[i] += MBIG;
      }
    }
  }

  private internalSample(): number {
    let a = this.inext, b = this.inextp;
    if (++a >= 56) a = 1;
    if (++b >= 56) b = 1;
    let r = this.seedArray[a] - this.seedArray[b];
    if (r === MBIG) r--;
    if (r < 0) r += MBIG;
    this.seedArray[a] = r;
    this.inext = a; this.inextp = b;
    return r;
  }

  private sample(): number { return this.internalSample() * (1.0 / MBIG); }

  next(a?: number, b?: number): number {
    if (a === undefined) return this.internalSample();
    if (b === undefined) return Math.trunc(this.sample() * a);
    return Math.trunc(this.sample() * (b - a)) + a;
  }

  nextDouble(): number { return this.sample(); }
}

/** UnityEngine.Random equivalents (non-deterministic, like Unity's default). */
export const UnityRandom = {
  value: () => Math.random(),
  /** float range [a,b] */
  range: (a: number, b: number) => a + Math.random() * (b - a),
  /** int range [a,b) */
  rangeInt: (a: number, b: number) => a + Math.floor(Math.random() * (b - a)),
  insideUnitSphere(): { x: number; y: number; z: number } {
    for (;;) {
      const x = Math.random() * 2 - 1, y = Math.random() * 2 - 1, z = Math.random() * 2 - 1;
      if (x * x + y * y + z * z <= 1) return { x, y, z };
    }
  },
  /** uniform random unit quaternion as [x,y,z,w] */
  rotation(): [number, number, number, number] {
    const u1 = Math.random(), u2 = Math.random(), u3 = Math.random();
    const s1 = Math.sqrt(1 - u1), s2 = Math.sqrt(u1);
    return [s1 * Math.sin(2 * Math.PI * u2), s1 * Math.cos(2 * Math.PI * u2), s2 * Math.sin(2 * Math.PI * u3), s2 * Math.cos(2 * Math.PI * u3)];
  },
};
