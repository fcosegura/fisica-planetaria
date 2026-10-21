import { FLAG_ACTIVE, FLAG_FIXED, G } from '../constants';
import type { PhysicsState } from '../state/physics-state';
import type { GravitySolver } from './gravity-solver';

/**
 * Direct O(N²) pairwise gravity. Each pair is evaluated once and applied to
 * both bodies (Newton's third law), halving the work of the naive i/j loop.
 */
export class DirectNBodySolver implements GravitySolver {
  readonly name = 'direct-nbody';

  /** Indices of active bodies with finite positions (reused between calls). */
  private active = new Int32Array(0);
  /** G·m per body; 0 when the mass is not a finite positive number. */
  private mu = new Float64Array(0);

  constructor(
    private readonly gravityConstant: number = G,
    private readonly softening: number = 0,
  ) {}

  computeAccelerations(state: PhysicsState): void {
    const { count, mass, position, acceleration, flags } = state;
    const eps2 = this.softening * this.softening;
    const Gc = this.gravityConstant;

    acceleration.fill(0);

    if (this.active.length < count) {
      this.active = new Int32Array(count);
      this.mu = new Float64Array(count);
    }
    const active = this.active;
    const mu = this.mu;

    let n = 0;
    for (let i = 0; i < count; i++) {
      if ((flags[i]! & FLAG_ACTIVE) === 0) continue;
      if (!Number.isFinite(position[i * 2]!) || !Number.isFinite(position[i * 2 + 1]!)) continue;
      const m = mass[i]!;
      mu[i] = Number.isFinite(m) && m > 0 ? Gc * m : 0;
      active[n++] = i;
    }

    for (let a = 0; a < n; a++) {
      const i = active[a]!;
      const xi = position[i * 2]!;
      const yi = position[i * 2 + 1]!;
      const mui = mu[i]!;
      let ax = 0;
      let ay = 0;

      for (let b = a + 1; b < n; b++) {
        const j = active[b]!;
        const dx = position[j * 2]! - xi;
        const dy = position[j * 2 + 1]! - yi;
        const r2 = dx * dx + dy * dy + eps2;
        if (!(r2 > 0)) continue;
        const invR3 = 1 / (r2 * Math.sqrt(r2));
        const sj = mu[j]! * invR3;
        const si = mui * invR3;
        ax += sj * dx;
        ay += sj * dy;
        acceleration[j * 2] -= si * dx;
        acceleration[j * 2 + 1] -= si * dy;
      }

      acceleration[i * 2] += ax;
      acceleration[i * 2 + 1] += ay;
    }

    for (let a = 0; a < n; a++) {
      const i = active[a]!;
      if ((flags[i]! & FLAG_FIXED) !== 0) {
        acceleration[i * 2] = 0;
        acceleration[i * 2 + 1] = 0;
        continue;
      }
      if (!Number.isFinite(acceleration[i * 2]!)) acceleration[i * 2] = 0;
      if (!Number.isFinite(acceleration[i * 2 + 1]!)) acceleration[i * 2 + 1] = 0;
    }
  }
}
