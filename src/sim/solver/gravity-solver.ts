import type { PhysicsState } from '../state/physics-state';

export interface GravitySolver {
  readonly name: string;
  computeAccelerations(state: PhysicsState): void;
}
