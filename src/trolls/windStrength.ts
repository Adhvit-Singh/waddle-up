/** Gust strengths (m/s² push). Round 3: half of the original Unity values, which felt too harsh. */
const SCALE = 0.5;
export const stageGustStrength = (stage: number) => (9 + stage * 0.45) * SCALE;
export const trapGustStrength = (stage: number) => (10 + stage * 0.6) * SCALE;
