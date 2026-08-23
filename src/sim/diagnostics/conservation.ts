import { FLAG_ACTIVE, G } from '../constants';
import type { PhysicsState } from '../state/physics-state';
import type { ConservationMetrics, ConservationSnapshot } from '../types';

export function computeConservationSnapshot(
  state: PhysicsState,
  gravityConstant: number = G,
): ConservationSnapshot {
  const { count, mass, position, velocity, flags } = state;

  let kineticEnergy = 0;
  let potentialEnergy = 0;
  let px = 0;
  let py = 0;
  let angularMomentum = 0;

  for (let i = 0; i < count; i++) {
    if (flags.length > 0 && (flags[i]! & FLAG_ACTIVE) === 0) continue;
    const m = mass[i]!;
    const vx = velocity[i * 2]!;
    const vy = velocity[i * 2 + 1]!;
    kineticEnergy += 0.5 * m * (vx * vx + vy * vy);
    px += m * vx;
    py += m * vy;
    angularMomentum += m * (position[i * 2]! * vy - position[i * 2 + 1]! * vx);
  }

  for (let i = 0; i < count; i++) {
    if (flags.length > 0 && (flags[i]! & FLAG_ACTIVE) === 0) continue;
    for (let j = i + 1; j < count; j++) {
      if (flags.length > 0 && (flags[j]! & FLAG_ACTIVE) === 0) continue;
      const dx = position[j * 2]! - position[i * 2]!;
      const dy = position[j * 2 + 1]! - position[i * 2 + 1]!;
      const r = Math.sqrt(dx * dx + dy * dy);
      if (r > 0) {
        potentialEnergy -= (gravityConstant * mass[i]! * mass[j]!) / r;
      }
    }
  }

  return {
    kineticEnergy,
    potentialEnergy,
    totalEnergy: kineticEnergy + potentialEnergy,
    linearMomentum: { x: px, y: py },
    angularMomentum,
  };
}

export function computeConservationMetrics(
  state: PhysicsState,
  gravityConstant: number,
  initial: ConservationSnapshot,
): ConservationMetrics {
  const current = computeConservationSnapshot(state, gravityConstant);

  const p0 = Math.hypot(initial.linearMomentum.x, initial.linearMomentum.y);
  const p1 = Math.hypot(current.linearMomentum.x, current.linearMomentum.y);
  const dp = Math.hypot(current.linearMomentum.x - initial.linearMomentum.x, current.linearMomentum.y - initial.linearMomentum.y);

  const e0 = Math.abs(initial.totalEnergy);
  const relativeEnergyError = e0 > 0 ? Math.abs(current.totalEnergy - initial.totalEnergy) / e0 : 0;
  const relativeMomentumError = p0 > 0 ? dp / p0 : p1;
  const l0 = Math.abs(initial.angularMomentum);
  const relativeAngularMomentumError =
    l0 > 0 ? Math.abs(current.angularMomentum - initial.angularMomentum) / l0 : Math.abs(current.angularMomentum);

  return {
    ...current,
    initial,
    relativeEnergyError,
    relativeMomentumError,
    relativeAngularMomentumError,
  };
}
