import type { PhysicsState } from '../state/physics-state';

export interface CollisionPolicy {
  readonly name: string;
  resolve(state: PhysicsState, mergeThresholdFactor: number): boolean;
}
