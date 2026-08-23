import type { CelestialBody } from '../types';

/** Timestep for systems that include moons / close satellites (s). */
export const PHYSICS_DT_MOON_SYSTEM = 120;

/** Timestep for distant Kuiper-like systems without moons (s). */
export const PHYSICS_DT_KUIPER = 7200;

/** Max preferred-dt kept as-is when already fine (e.g. Earth–Moon = 300 s). */
export const PHYSICS_DT_FINE_THRESHOLD = 300;

/** Pair distance below which a secondary may be treated as a close satellite (m). */
export const CLOSE_SATELLITE_DISTANCE_M = 1e10;

/**
 * Secondary/primary mass ratio below this counts as a moon-like satellite.
 * Charon/Pluto ≈ 0.12; random KBO pairs are typically near 1.
 */
export const SATELLITE_MASS_RATIO_MAX = 0.2;

function isSolarMassBody(body: CelestialBody): boolean {
  return body.mass >= 1e29 || body.name.toLowerCase().includes('sol');
}

/**
 * True when the system contains a close moon-like pair (not two comparable KBOs).
 */
export function hasCloseSatellites(bodies: readonly CelestialBody[]): boolean {
  for (let i = 0; i < bodies.length; i++) {
    const b1 = bodies[i]!;
    if (isSolarMassBody(b1)) continue;
    for (let j = i + 1; j < bodies.length; j++) {
      const b2 = bodies[j]!;
      if (isSolarMassBody(b2)) continue;
      const d = Math.hypot(b1.position.x - b2.position.x, b1.position.y - b2.position.y);
      if (d >= CLOSE_SATELLITE_DISTANCE_M) continue;
      const lighter = Math.min(b1.mass, b2.mass);
      const heavier = Math.max(b1.mass, b2.mass);
      if (heavier <= 0) continue;
      if (lighter / heavier < SATELLITE_MASS_RATIO_MAX) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Resolve physicsDt from composition + preferred preset value.
 * Never raises dt silently when satellites are removed — only tightens when needed.
 * Call only when rebuilding a document, never during runFrame/stepOnce.
 */
export function resolvePhysicsDt(
  bodies: readonly CelestialBody[],
  preferredDt: number,
): number {
  if (hasCloseSatellites(bodies) && preferredDt > PHYSICS_DT_MOON_SYSTEM) {
    // Preserve already-fine presets (e.g. Earth–Moon at 300 s).
    if (preferredDt <= PHYSICS_DT_FINE_THRESHOLD) {
      return preferredDt;
    }
    return PHYSICS_DT_MOON_SYSTEM;
  }
  return preferredDt;
}
