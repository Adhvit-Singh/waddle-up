/** Unity-style clock. `time`/`deltaTime` stop while timeScale = 0; unscaled ones keep running. */
export const Time = {
  time: 0,
  deltaTime: 0,
  unscaledTime: 0,
  unscaledDeltaTime: 0,
  fixedDeltaTime: 0.02,
  timeScale: 1,
  frameCount: 0,
};

/** Fixed-step accumulator. Clamps huge frame gaps (tab switch) to a few steps. */
export class FixedStepper {
  private acc = 0;
  step: number; maxSteps: number;
  constructor(step: number, maxSteps = 5) { this.step = step; this.maxSteps = maxSteps; }
  stepsFor(dt: number): number {
    this.acc += dt;
    let n = 0;
    while (this.acc >= this.step - 1e-9 && n < this.maxSteps) { this.acc -= this.step; n++; }
    if (n >= this.maxSteps) this.acc = 0;
    return n;
  }
  /** 0..1 how far we are into the next step (for render interpolation) */
  get alpha() { return Math.min(1, Math.max(0, this.acc / this.step)); }
}
