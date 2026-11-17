/**
 * Anti-skip rule: the auto-grab may only take a ledge at most 2 further along the path than the last ledge the penguin
 * stood on (the next ledge, or a wall right after it). Lower ledges, non-ledge rock and "unknown" (-1, right after a
 * teleport) are always allowed.
 */
export function grabAllowed(targetIndex: number | null, lastStoodIndex: number): boolean {
  if (targetIndex == null || targetIndex < 0 || lastStoodIndex < 0) return true;
  return targetIndex <= lastStoodIndex + 2;
}
