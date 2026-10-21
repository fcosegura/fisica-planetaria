import { FLAG_ACTIVE, FLAG_FIXED } from '../constants';
import type { PhysicsState } from '../state/physics-state';
import type { CollisionPolicy } from './collision-policy';
import { displayRadiusFromPhysical } from '../visual/display-radius';

export class MergeCollisionPolicy implements CollisionPolicy {
  readonly name = 'merge';

  /** Physical radii copied once per call so the pair loop avoids `meta` lookups. */
  private radii = new Float64Array(0);

  resolve(state: PhysicsState, mergeThresholdFactor: number): boolean {
    const count = state.count;
    if (this.radii.length < count) this.radii = new Float64Array(count);
    const radii = this.radii;
    for (let i = 0; i < count; i++) radii[i] = state.meta[i]!.radius;

    const { position, flags } = state;
    let mergedCount = 0;

    for (let i = 0; i < count; i++) {
      if ((flags[i]! & FLAG_ACTIVE) === 0) continue;

      for (let j = i + 1; j < count; j++) {
        if ((flags[j]! & FLAG_ACTIVE) === 0) continue;

        const threshold = (radii[i]! + radii[j]!) * mergeThresholdFactor;
        if (!(threshold > 0)) continue;
        const dx = position[j * 2]! - position[i * 2]!;
        const dy = position[j * 2 + 1]! - position[i * 2 + 1]!;
        // Squared comparison: no sqrt/hypot in the O(N²) hot path. NaN never merges.
        if (!(dx * dx + dy * dy < threshold * threshold)) continue;

        this.mergePair(state, i, j);
        radii[i] = state.meta[i]!.radius;
        mergedCount++;
        flags[j] = 0;
      }
    }

    if (mergedCount === 0) return false;

    // Compact removed bodies
    let write = 0;
    for (let read = 0; read < state.count; read++) {
      if ((state.flags[read]! & FLAG_ACTIVE) === 0) continue;
      if (write !== read) {
        state.ids[write] = state.ids[read]!;
        state.meta[write] = state.meta[read]!;
        state.mass[write] = state.mass[read]!;
        state.flags[write] = state.flags[read]!;
        state.position[write * 2] = state.position[read * 2]!;
        state.position[write * 2 + 1] = state.position[read * 2 + 1]!;
        state.velocity[write * 2] = state.velocity[read * 2]!;
        state.velocity[write * 2 + 1] = state.velocity[read * 2 + 1]!;
        state.acceleration[write * 2] = state.acceleration[read * 2]!;
        state.acceleration[write * 2 + 1] = state.acceleration[read * 2 + 1]!;
      }
      write++;
    }

    if (write < state.count) {
      state.count = write;
      state.ids.length = write;
      state.meta.length = write;
    }

    return true;
  }

  private mergePair(state: PhysicsState, i: number, j: number): void {
    const mi = state.mass[i]!;
    const mj = state.mass[j]!;
    const mTotal = mi + mj;

    const xi = state.position[i * 2]!;
    const yi = state.position[i * 2 + 1]!;
    const xj = state.position[j * 2]!;
    const yj = state.position[j * 2 + 1]!;

    const vxi = state.velocity[i * 2]!;
    const vyi = state.velocity[i * 2 + 1]!;
    const vxj = state.velocity[j * 2]!;
    const vyj = state.velocity[j * 2 + 1]!;

    state.mass[i] = mTotal;
    state.position[i * 2] = (mi * xi + mj * xj) / mTotal;
    state.position[i * 2 + 1] = (mi * yi + mj * yj) / mTotal;
    state.velocity[i * 2] = (mi * vxi + mj * vxj) / mTotal;
    state.velocity[i * 2 + 1] = (mi * vyi + mj * vyj) / mTotal;

    const ri = state.meta[i]!.radius;
    const rj = state.meta[j]!.radius;
    const newRadius = Math.cbrt(ri ** 3 + rj ** 3);
    state.meta[i]!.radius = newRadius;
    state.meta[i]!.name = `${state.meta[i]!.name}+${state.meta[j]!.name}`;

    const isFixed = (state.flags[i]! & FLAG_FIXED) !== 0 || (state.flags[j]! & FLAG_FIXED) !== 0;
    if (isFixed) {
      state.flags[i] = state.flags[i]! | FLAG_FIXED;
      state.meta[i]!.state = 'fixed';
    }

    state.meta[i]!.visual = {
      ...state.meta[i]!.visual,
      displayRadius: displayRadiusFromPhysical(newRadius, isFixed),
    };
  }
}
