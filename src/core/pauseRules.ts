/** Pause behaviour rules (round 3), kept small and pure so they're tested. */
export interface EscUI { back(): boolean; readonly creditsActive: boolean; endCredits(): void; }
export type EscState = 'playing' | 'paused' | 'menu' | 'other';

/** Esc: pauses while playing. While paused it only closes sub-menus: it can never resume (click RESUME instead). */
export function onEscape(state: EscState, ui: EscUI, setPaused: (on: boolean) => void) {
  if (state === 'playing') setPaused(true);
  else if (state === 'paused' || state === 'menu') ui.back();
  else if (ui.creditsActive) ui.endCredits();
}

/** how many times the RESUME button runs away from the mouse before it can be clicked (4–7) */
export const resumeDodges = (rand: number) => 4 + Math.min(3, Math.floor(rand * 4));

/** the browser released the mouse: pause, unless something (the local dev menu) deliberately holds it free */
export const shouldPauseOnUnlock = (hadLock: boolean, playing: boolean, holdUnlocked: boolean) => hadLock && playing && !holdUnlocked;
