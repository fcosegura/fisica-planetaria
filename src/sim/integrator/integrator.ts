import type { GravitySolver } from '../solver/gravity-solver';

export interface Integrator {
  readonly name: string;
  step(state: import('../state/physics-state').PhysicsState, solver: GravitySolver, dt: number): void;
  bootstrap(state: import('../state/physics-state').PhysicsState, solver: GravitySolver): void;
}
