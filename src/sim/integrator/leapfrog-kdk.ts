import type { PhysicsState } from '../state/physics-state';
import type { Integrator } from './integrator';
import type { GravitySolver } from '../solver/gravity-solver';
import { FLAG_FIXED } from '../constants';

export class LeapfrogKDKIntegrator implements Integrator {
  readonly name = 'leapfrog-kdk';

  bootstrap(state: PhysicsState, solver: GravitySolver): void {
    solver.computeAccelerations(state);
  }

  step(state: PhysicsState, solver: GravitySolver, dt: number): void {
    const { count, velocity, position, acceleration, flags } = state;
    const half = dt * 0.5;

    // Half-kick
    for (let i = 0; i < count; i++) {
      if ((flags[i] & FLAG_FIXED) !== 0) continue;
      velocity[i * 2] += acceleration[i * 2] * half;
      velocity[i * 2 + 1] += acceleration[i * 2 + 1] * half;
    }

    // Drift
    for (let i = 0; i < count; i++) {
      if ((flags[i] & FLAG_FIXED) !== 0) continue;
      position[i * 2] += velocity[i * 2] * dt;
      position[i * 2 + 1] += velocity[i * 2 + 1] * dt;
    }

    // Forces at new positions
    solver.computeAccelerations(state);

    // Second half-kick
    for (let i = 0; i < count; i++) {
      if ((flags[i] & FLAG_FIXED) !== 0) continue;
      velocity[i * 2] += acceleration[i * 2] * half;
      velocity[i * 2 + 1] += acceleration[i * 2 + 1] * half;
    }
  }
}
