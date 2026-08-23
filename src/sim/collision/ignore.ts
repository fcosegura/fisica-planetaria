import type { PhysicsState } from '../state/physics-state';
import type { CollisionPolicy } from './collision-policy';

export class IgnoreCollisionPolicy implements CollisionPolicy {
  readonly name = 'ignore';

  resolve(_state: PhysicsState, _mergeThresholdFactor: number): boolean {
    return false;
  }
}
