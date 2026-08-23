import { G } from '../constants';
import type { CelestialBody, EngineCompatibility } from '../types';
import { cartesianToKepler } from './kepler-2d';

/**
 * Primary must outweigh the next body by at least this factor.
 * Sun/Jupiter ≈ 1047; Earth/Moon ≈ 81; equal binaries ≈ 1 (rejected).
 */
export const DOMINANT_MASS_RATIO = 20;

export interface OrbitalCompatibilityDetails extends EngineCompatibility {
  primaryIndex: number;
  primaryFixed: boolean;
}

const OK: Omit<OrbitalCompatibilityDetails, 'primaryIndex' | 'primaryFixed'> = {
  compatible: true,
  code: 'ok',
  reason: null,
};

export function findPrimaryIndex(bodies: readonly CelestialBody[]): number {
  let best = 0;
  for (let i = 1; i < bodies.length; i++) {
    if (bodies[i]!.mass > bodies[best]!.mass) best = i;
  }
  return best;
}

function hillRadius(distanceToPrimary: number, planetMass: number, primaryMass: number): number {
  if (primaryMass <= 0 || distanceToPrimary <= 0) return 0;
  return distanceToPrimary * Math.cbrt(planetMass / (3 * primaryMass));
}

function muForBody(primary: CelestialBody, body: CelestialBody, gravityConstant: number): number {
  return primary.state === 'fixed'
    ? gravityConstant * primary.mass
    : gravityConstant * (primary.mass + body.mass);
}

/**
 * First-version orbital engine: one dominant primary + independent elliptical
 * two-body orbits. Hierarchical moons, comparable masses, and e ≥ 1 are rejected.
 */
export function assessOrbitalCompatibility(
  bodies: readonly CelestialBody[],
  gravityConstant: number = G,
): OrbitalCompatibilityDetails {
  if (bodies.length < 2) {
    return {
      compatible: false,
      code: 'too_few_bodies',
      reason: 'Se necesita un cuerpo central y al menos un órbitador.',
      primaryIndex: 0,
      primaryFixed: bodies[0]?.state === 'fixed',
    };
  }

  const primaryIndex = findPrimaryIndex(bodies);
  const primary = bodies[primaryIndex]!;
  const primaryFixed = primary.state === 'fixed';

  let secondMass = 0;
  let orbiterCount = 0;
  for (let i = 0; i < bodies.length; i++) {
    if (i === primaryIndex) continue;
    orbiterCount += 1;
    secondMass = Math.max(secondMass, bodies[i]!.mass);
  }

  if (orbiterCount === 0) {
    return {
      compatible: false,
      code: 'no_orbiter',
      reason: 'No hay cuerpos en órbita elíptica alrededor del central.',
      primaryIndex,
      primaryFixed,
    };
  }

  if (!(primary.mass >= DOMINANT_MASS_RATIO * secondMass) || primary.mass <= 0) {
    return {
      compatible: false,
      code: 'no_dominant',
      reason: 'No hay un cuerpo central dominante (las masas son comparables).',
      primaryIndex,
      primaryFixed,
    };
  }

  for (let i = 0; i < bodies.length; i++) {
    if (i === primaryIndex) continue;
    const body = bodies[i]!;
    if (body.state === 'fixed') {
      return {
        compatible: false,
        code: 'degenerate',
        reason: 'Hay órbitas degeneradas (cuerpo no primario marcado como fijo).',
        primaryIndex,
        primaryFixed,
      };
    }

    const rx = body.position.x - primary.position.x;
    const ry = body.position.y - primary.position.y;
    const vx = body.velocity.x - primary.velocity.x;
    const vy = body.velocity.y - primary.velocity.y;
    const mu = muForBody(primary, body, gravityConstant);
    const kep = cartesianToKepler(rx, ry, vx, vy, mu);
    if ('error' in kep) {
      if (kep.error === 'unbound' || kep.error === 'not_ellipse') {
        return {
          compatible: false,
          code: 'not_ellipse',
          reason: 'Hay órbitas no elípticas (parabólicas, hiperbólicas o de escape).',
          primaryIndex,
          primaryFixed,
        };
      }
      return {
        compatible: false,
        code: 'degenerate',
        reason: 'Hay órbitas degeneradas (caída radial o estado no finito).',
        primaryIndex,
        primaryFixed,
      };
    }
  }

  for (let j = 0; j < bodies.length; j++) {
    if (j === primaryIndex) continue;
    const planet = bodies[j]!;
    const aPlanet = Math.hypot(
      planet.position.x - primary.position.x,
      planet.position.y - primary.position.y,
    );
    const rHill = hillRadius(aPlanet, planet.mass, primary.mass);
    if (rHill <= 0) continue;
    for (let i = 0; i < bodies.length; i++) {
      if (i === primaryIndex || i === j) continue;
      const other = bodies[i]!;
      if (other.mass >= planet.mass) continue;
      const d = Math.hypot(other.position.x - planet.position.x, other.position.y - planet.position.y);
      if (d < rHill) {
        return {
          compatible: false,
          code: 'hierarchy',
          reason:
            'Hay satélites jerárquicos (p. ej. lunas). El motor orbital de dos cuerpos no los representa.',
          primaryIndex,
          primaryFixed,
        };
      }
    }
  }

  return { ...OK, primaryIndex, primaryFixed };
}
