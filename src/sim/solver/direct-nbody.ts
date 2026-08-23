import { G } from '../constants';
import type { PhysicsState } from '../state/physics-state';
import type { GravitySolver } from './gravity-solver';

export class DirectNBodySolver implements GravitySolver {
  readonly name = 'direct-nbody';

  constructor(
    private readonly gravityConstant: number = G,
    private readonly softening: number = 0,
  ) {}

  computeAccelerations(state: PhysicsState): void {
    const { count, mass, position, acceleration, flags } = state;
    const eps2 = this.softening * this.softening;
    const Gc = this.gravityConstant;

    acceleration.fill(0);

    for (let i = 0; i < count; i++) {
      if ((flags[i] & 2) === 0) continue;

      let ax = 0;
      let ay = 0;
      const xi = position[i * 2];
      const yi = position[i * 2 + 1];
      if (!Number.isFinite(xi) || !Number.isFinite(yi)) continue;

      for (let j = 0; j < count; j++) {
        if (i === j || (flags[j] & 2) === 0) continue;
        const mj = mass[j];
        if (!Number.isFinite(mj) || mj <= 0) continue;

        const dx = position[j * 2] - xi;
        const dy = position[j * 2 + 1] - yi;
        const r2 = dx * dx + dy * dy + eps2;
        if (!(r2 > 0) || !Number.isFinite(r2)) continue;
        const invR3 = 1 / (r2 * Math.sqrt(r2));
        const mu = Gc * mj;
        ax += mu * dx * invR3;
        ay += mu * dy * invR3;
      }

      if ((flags[i] & 1) === 0) {
        acceleration[i * 2] = Number.isFinite(ax) ? ax : 0;
        acceleration[i * 2 + 1] = Number.isFinite(ay) ? ay : 0;
      }
    }
  }
}
