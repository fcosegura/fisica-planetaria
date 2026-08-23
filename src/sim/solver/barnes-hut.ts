import type { PhysicsState } from '../state/physics-state';
import type { GravitySolver } from './gravity-solver';

/** Stub for future Barnes-Hut implementation */
export class BarnesHutSolver implements GravitySolver {
  readonly name = 'barnes-hut';

  computeAccelerations(_state: PhysicsState): void {
    throw new Error('BarnesHutSolver not implemented in v1');
  }
}
