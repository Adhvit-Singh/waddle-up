import { Time } from '../core/time.ts';
import { refs } from '../core/refs.ts';

export type CameraTrollKind = 'zoom' | 'roll';

/** Timed effects of the round-2 traps that other systems read (input delay, camera troll). */
export const TrapEffects = {
  inputDelayUntil: 0,
  cameraTroll: null as null | { kind: CameraTrollKind; until: number },

  get inputDelayActive() { return Time.time < this.inputDelayUntil; },
  startInputDelay(seconds: number) { this.inputDelayUntil = Time.time + seconds; },

  startCameraTroll(kind: CameraTrollKind, seconds: number) { this.cameraTroll = { kind, until: Time.time + seconds }; },
  /** current camera troll, or null when none / expired */
  get activeCameraTroll() {
    if (this.cameraTroll && Time.time >= this.cameraTroll.until) this.cameraTroll = null;
    return this.cameraTroll;
  },

  /** new run, send-to-bottom, menu: everything back to normal */
  reset() {
    this.inputDelayUntil = 0;
    this.cameraTroll = null;
    refs.ui?.fakeCrash(false);
    refs.ui?.fakeSave(false);
  },
};
