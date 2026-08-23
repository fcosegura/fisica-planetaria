import { G, M_EARTH } from '../constants';
import type { CelestialBody, Vec2 } from '../types';

export interface OrbitComputeOptions {
  gravityConstant?: number;
  softening?: number;
  /** Minimum distance from any body surface to allow placement */
  minSurfaceGap?: number;
}

/** Gravitational acceleration at `position` from all `bodies`. */
export function computeGravitationalAcceleration(
  position: Vec2,
  bodies: readonly CelestialBody[],
  options: OrbitComputeOptions = {},
): Vec2 {
  const Gc = options.gravityConstant ?? G;
  const eps2 = (options.softening ?? 0) ** 2;

  let ax = 0;
  let ay = 0;

  for (const body of bodies) {
    const dx = body.position.x - position.x;
    const dy = body.position.y - position.y;
    const r2 = dx * dx + dy * dy + eps2;
    const invR3 = 1 / (r2 * Math.sqrt(r2));
    const mu = Gc * body.mass;
    ax += mu * dx * invR3;
    ay += mu * dy * invR3;
  }

  return { x: ax, y: ay };
}

/** Body that contributes the largest gravitational acceleration at `position`. */
export function findDominantAttractor(
  position: Vec2,
  bodies: readonly CelestialBody[],
  options: OrbitComputeOptions = {},
): CelestialBody | null {
  const Gc = options.gravityConstant ?? G;
  const eps2 = (options.softening ?? 0) ** 2;

  let best: CelestialBody | null = null;
  let bestAccel = 0;

  for (const body of bodies) {
    const dx = body.position.x - position.x;
    const dy = body.position.y - position.y;
    const r2 = dx * dx + dy * dy + eps2;
    const accel = (Gc * body.mass) / r2;
    if (accel > bestAccel) {
      bestAccel = accel;
      best = body;
    }
  }

  return best;
}

/** Hill sphere radius for a satellite orbiting `body` around `primary`. */
export function hillSphereRadius(
  body: CelestialBody,
  primaryMass: number,
  distanceToPrimary: number,
): number {
  if (primaryMass <= 0 || distanceToPrimary <= 0) return 0;
  return distanceToPrimary * Math.cbrt(body.mass / (3 * primaryMass));
}

/**
 * Reference body for circular-orbit initial conditions.
 * Uses the nearest body when inside its Hill sphere; otherwise the dominant attractor.
 */
export function findOrbitReference(
  position: Vec2,
  bodies: readonly CelestialBody[],
  options: OrbitComputeOptions = {},
): { attractor: CelestialBody | null; useLocalField: boolean } {
  if (bodies.length === 0) return { attractor: null, useLocalField: false };

  let closest: CelestialBody | null = null;
  let closestDist = Infinity;

  for (const body of bodies) {
    const d = Math.hypot(body.position.x - position.x, body.position.y - position.y);
    if (d < closestDist) {
      closestDist = d;
      closest = body;
    }
  }

  if (!closest) {
    return { attractor: findDominantAttractor(position, bodies, options), useLocalField: false };
  }

  const primary = bodies.reduce((a, b) => (b.mass > a.mass ? b : a), bodies[0]!);
  if (closest.id !== primary.id) {
    const distToPrimary = Math.hypot(
      closest.position.x - primary.position.x,
      closest.position.y - primary.position.y,
    );
    const hill = hillSphereRadius(closest, primary.mass, distToPrimary);
    if (closestDist < hill) return { attractor: closest, useLocalField: true };
  }

  return {
    attractor: findDominantAttractor(position, bodies, options),
    useLocalField: false,
  };
}

export interface CircularOrbitResult {
  velocity: Vec2;
  attractor: CelestialBody | null;
  speed: number;
  /** Distance to the reference attractor used for the tangential direction */
  orbitRadius: number;
}

/**
 * Circular-orbit velocity at an arbitrary point, using the total N-body
 * gravitational field. The speed satisfies v²/r ≈ g_radial toward the
 * dominant attractor; velocity includes the attractor's inertial motion.
 */
export function computeCircularOrbitVelocity(
  position: Vec2,
  bodies: readonly CelestialBody[],
  options: OrbitComputeOptions = {},
): CircularOrbitResult {
  const { attractor, useLocalField } = findOrbitReference(position, bodies, options);

  if (!attractor || bodies.length === 0) {
    return { velocity: { x: 0, y: 0 }, attractor: null, speed: 0, orbitRadius: 0 };
  }

  const rx = position.x - attractor.position.x;
  const ry = position.y - attractor.position.y;
  const r = Math.hypot(rx, ry);

  if (r === 0) {
    return {
      velocity: { ...attractor.velocity },
      attractor,
      speed: 0,
      orbitRadius: 0,
    };
  }

  const g = useLocalField
    ? computeGravitationalAcceleration(position, [attractor], options)
    : computeGravitationalAcceleration(position, bodies, options);

  // Unit vector from position toward attractor (inward radial)
  const rHatX = -rx / r;
  const rHatY = -ry / r;

  const gRadial = g.x * rHatX + g.y * rHatY;
  const speed = gRadial > 0 ? Math.sqrt(gRadial * r) : 0;

  // Counterclockwise tangent around attractor
  const tHatX = -ry / r;
  const tHatY = rx / r;

  return {
    velocity: {
      x: attractor.velocity.x + speed * tHatX,
      y: attractor.velocity.y + speed * tHatY,
    },
    attractor,
    speed,
    orbitRadius: r,
  };
}

export function canPlaceAtPosition(
  position: Vec2,
  bodies: readonly CelestialBody[],
  newBodyRadius: number,
  minSurfaceGap = 0,
): boolean {
  for (const body of bodies) {
    const d = Math.hypot(body.position.x - position.x, body.position.y - position.y);
    if (d < body.radius + newBodyRadius + minSurfaceGap) return false;
  }
  return true;
}

export interface BodyAtPositionOptions {
  mass?: number;
  radius?: number;
  name?: string;
  color?: string;
  id?: string;
  orbit?: OrbitComputeOptions;
}

export function makeBodyAtPosition(
  position: Vec2,
  existing: readonly CelestialBody[],
  createId: () => string,
  makeVisual: (color: string, physicalRadius: number) => CelestialBody['visual'],
  options: BodyAtPositionOptions = {},
): CelestialBody | null {
  const mass = options.mass ?? M_EARTH;
  const radius = options.radius ?? 6.371e6;
  const minGap = options.orbit?.minSurfaceGap ?? 0;

  if (!canPlaceAtPosition(position, existing, radius, minGap)) {
    return null;
  }

  const { velocity } = computeCircularOrbitVelocity(position, existing, options.orbit);
  const customCount = existing.filter((b) => b.name.startsWith('Cuerpo ')).length;

  return {
    id: options.id ?? createId(),
    name: options.name ?? `Cuerpo ${customCount + 1}`,
    mass,
    radius,
    position: { ...position },
    velocity,
    state: 'dynamic',
    visual: makeVisual(options.color ?? '#10b981', radius),
  };
}
