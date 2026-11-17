import { MouseSpikeFilter } from './mouseFilter.ts';

/** Keyboard / mouse / gamepad state with Unity-style "pressed this frame" semantics. */
const down = new Set<string>();
const pressed = new Set<string>();
let mdx = 0, mdy = 0, scroll = 0, mouseClicked = false;
let canvas: HTMLElement | null = null;
let padPrev: boolean[] = [];
let padNow: boolean[] = [];
const lockListeners: ((locked: boolean) => void)[] = [];
let anyGesture: (() => void)[] = [];
let spikes = new MouseSpikeFilter();

export const Input = {
  init(el: HTMLElement) {
    canvas = el;
    addEventListener('keydown', e => {
      if (!e.repeat) pressed.add(e.code);
      down.add(e.code);
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
      fireGesture();
    });
    addEventListener('keyup', e => down.delete(e.code));
    addEventListener('blur', () => down.clear());
    addEventListener('mousemove', e => {
      if (!Input.isLocked) return;
      const d = spikes.filter(e.movementX, e.movementY);
      mdx += d.x; mdy += d.y;
    });
    addEventListener('mousedown', e => { if (e.button === 0) mouseClicked = true; fireGesture(); });
    addEventListener('wheel', e => { scroll += -Math.sign(e.deltaY); }, { passive: true });
    document.addEventListener('pointerlockchange', () => { spikes = new MouseSpikeFilter(); for (const l of lockListeners) l(Input.isLocked); });
  },
  isPressed: (code: string) => down.has(code),
  wasPressed: (code: string) => pressed.has(code),
  /** mouse delta in pixels this frame (y down positive, like the browser; Unity's y is up → negate when porting) */
  get mouseDelta() { return { x: mdx, y: mdy }; },
  get scrollY() { return scroll; },
  get mouseClicked() { return mouseClicked; },
  get isLocked() { return canvas != null && document.pointerLockElement === canvas; },
  lockPointer() {
    if (!canvas || Input.isLocked) return;
    // Raw (unadjusted) mouse movement: no OS acceleration, like Unity's Mouse.delta on Windows, and it avoids the
    // Chromium pointer-lock glitch that reports huge fake jumps. Fall back to a normal lock where unsupported.
    const el = canvas as HTMLElement & { requestPointerLock(o?: { unadjustedMovement?: boolean }): Promise<void> | void };
    const plain = () => { try { const q = el.requestPointerLock(); if (q instanceof Promise) q.catch(() => {}); } catch { /* ignored */ } };
    try {
      const p = el.requestPointerLock({ unadjustedMovement: true });
      if (p instanceof Promise) p.catch((err: DOMException) => { if (err?.name === 'NotSupportedError') plain(); });
    } catch { plain(); }
  },
  unlockPointer() { if (Input.isLocked) document.exitPointerLock(); },
  onLockChange(f: (locked: boolean) => void) { lockListeners.push(f); },
  /** first user gesture (needed to start audio) */
  onGesture(f: () => void) { anyGesture.push(f); },

  // ---- gamepad (standard mapping)
  pollGamepad() {
    padPrev = padNow;
    const gp = navigator.getGamepads?.()[0];
    padNow = gp ? gp.buttons.map(b => b.pressed) : [];
  },
  gamepad() {
    const gp = navigator.getGamepads?.()[0];
    if (!gp) return null;
    const dz = (v: number) => (Math.abs(v) < 0.15 ? 0 : v);
    return {
      left: { x: dz(gp.axes[0] ?? 0), y: -dz(gp.axes[1] ?? 0) },
      right: { x: dz(gp.axes[2] ?? 0), y: -dz(gp.axes[3] ?? 0) },
      pressed: (i: number) => !!padNow[i] && !padPrev[i],
    };
  },

  endFrame() { pressed.clear(); mdx = 0; mdy = 0; scroll = 0; mouseClicked = false; },
};

function fireGesture() {
  if (!anyGesture.length) return;
  const l = anyGesture; anyGesture = [];
  for (const f of l) f();
}
