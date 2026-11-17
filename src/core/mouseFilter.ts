/**
 * Drops single impossible mouse jumps. Chromium browsers on Windows (Chrome, Edge, Brave) sometimes report one
 * huge movementX/Y while the pointer is locked, which snaps the camera. Real movement ramps up over a few events;
 * a glitch appears out of nowhere.
 */
export class MouseSpikeFilter {
  private recent: number[] = [];
  filter(dx: number, dy: number): { x: number; y: number } {
    const mag = Math.hypot(dx, dy);
    const ref = Math.max(10, ...this.recent);
    if (mag > 200 && mag > ref * 6) return { x: 0, y: 0 };
    this.recent.push(mag);
    if (this.recent.length > 3) this.recent.shift();
    return { x: dx, y: dy };
  }
}
