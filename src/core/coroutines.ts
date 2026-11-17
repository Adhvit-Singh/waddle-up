import { Time } from './time.ts';

/** What a coroutine may yield: seconds (scaled), {realtime: s}, or null/undefined for "next frame". */
export type Yield = number | { realtime: number } | null | undefined | void;
export type Co = Generator<Yield, void, unknown>;

interface Running { owner: object; gen: Co; wakeScaled: number; wakeReal: number; dead: boolean; }

const running: Running[] = [];

function step(r: Running) {
  const res = r.gen.next();
  if (res.done) { r.dead = true; return; }
  const y = res.value;
  r.wakeScaled = -Infinity; r.wakeReal = -Infinity;
  if (typeof y === 'number') r.wakeScaled = Time.time + y;
  else if (y && typeof y === 'object' && 'realtime' in y) r.wakeReal = Time.unscaledTime + y.realtime;
}

/** Unity StartCoroutine: runs synchronously until the first yield. */
export const Scheduler = {
  start(owner: object, gen: Co): Running {
    const r: Running = { owner, gen, wakeScaled: -Infinity, wakeReal: -Infinity, dead: false };
    running.push(r);
    step(r);
    return r;
  },
  stop(r: Running | null | undefined) { if (r) r.dead = true; },
  stopAll(owner: object) { for (const r of running) if (r.owner === owner) r.dead = true; },
  update() {
    const snapshot = running.slice();
    for (const r of snapshot) {
      if (r.dead) continue;
      if (Time.time < r.wakeScaled || Time.unscaledTime < r.wakeReal) continue;
      step(r);
    }
    for (let i = running.length - 1; i >= 0; i--) if (running[i].dead) running.splice(i, 1);
  },
};
