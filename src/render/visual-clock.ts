/**
 * Visual-only clock for corona, haze and gas-band motion.
 *
 * - Advances with wall-clock time while the simulation is playing.
 * - Freezes while paused so the scene stays still with the physics.
 * - Stays at 0 when `prefers-reduced-motion: reduce` is set.
 *
 * Never reads or writes `simulationTime` / `physicsDt`.
 */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export class VisualClock {
  private accumulatedMs = 0;
  private lastWallMs: number | null = null;
  private frozen = true;

  tick(wallMs: number, playing: boolean, reduceMotion = prefersReducedMotion()): number {
    if (reduceMotion) {
      this.lastWallMs = wallMs;
      this.frozen = true;
      return 0;
    }

    if (!playing) {
      this.lastWallMs = wallMs;
      this.frozen = true;
      return this.accumulatedMs;
    }

    if (this.lastWallMs === null || this.frozen) {
      this.lastWallMs = wallMs;
      this.frozen = false;
      return this.accumulatedMs;
    }

    this.accumulatedMs += Math.max(0, wallMs - this.lastWallMs);
    this.lastWallMs = wallMs;
    return this.accumulatedMs;
  }
}
