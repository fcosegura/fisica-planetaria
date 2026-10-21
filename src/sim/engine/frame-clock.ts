/**
 * Longest wall-clock interval (s) credited to a single frame. Longer gaps
 * (tab in background, pause/resume, debugger) are clamped so the simulation
 * does not jump ahead or try to catch up with thousands of substeps.
 */
export const MAX_FRAME_WALL_SECONDS = 0.1;

/**
 * Measures real elapsed time between `runFrame` calls so the simulation
 * advances `timeScale × wallSeconds`, independent of the display refresh rate
 * (60, 120, 144 Hz…) and of dropped frames.
 *
 * Headless calls (no timestamp) use the nominal `1 / targetFps`, which keeps
 * tests and benchmarks deterministic.
 */
export class FrameClock {
  private lastMs: number | null = null;

  advance(nowMs: number | undefined, targetFps: number): number {
    const nominal = 1 / targetFps;
    if (nowMs === undefined) return nominal;

    const last = this.lastMs;
    this.lastMs = nowMs;
    if (last === null) return nominal;

    const seconds = (nowMs - last) / 1000;
    if (!(seconds > 0)) return 0;
    return Math.min(seconds, MAX_FRAME_WALL_SECONDS);
  }

  reset(): void {
    this.lastMs = null;
  }
}
