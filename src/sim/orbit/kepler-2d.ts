/**
 * 2D Keplerian two-body propagation (elliptical, including circular).
 *
 * Relative motion in the orbital plane:
 *   μ = G (M + m)           (both bodies dynamic)
 *   μ = G M_primary         (primary fixed — matches catalog vis-viva)
 *   n = √(μ / a³)
 *   M(t) = M₀ + n (t − t₀)  (linear; negative Δt is backward in time)
 *   E − e sin E = M         (Kepler; Newton–Halley)
 *   r, v from the eccentric anomaly in the perifocal frame, then rotated by ω.
 *
 * Solver policy (deterministic):
 *   - Mean anomaly wrapped to (−π, π]
 *   - At most KEPLER_MAX_ITERATIONS iterations (no Date, no Math.random)
 *   - Stop when |ΔE| < KEPLER_ABS_TOL_E = 1e-14 rad
 *
 * Tolerance derivation:
 *   Machine ε ≈ 2e-16. Position scale is r ≈ a (cos E − e), so
 *   |Δr| ≲ a |ΔE|. At 1 AU, 1e-14 rad → ~1.5 mm. At Sedna a ≈ 507 AU → ~750 m,
 *   which is ~1e-12 of a. Tests use |Δr|/a < 1e-10 (margin for trig + wrapping).
 */

export const KEPLER_ABS_TOL_E = 1e-14;
export const KEPLER_MAX_ITERATIONS = 30;
/** Eccentricity below this is treated as a well-defined circular orbit. */
export const CIRCULAR_ECCENTRICITY = 1e-12;
/** Specific angular momentum / √(μ a) below this is a radial degeneracy. */
export const MIN_SPECIFIC_ANGULAR_MOMENTUM_RATIO = 1e-12;

export type KeplerFailure =
  | 'not_finite'
  | 'unbound'
  | 'not_ellipse'
  | 'radial'
  | 'non_positive_a';

export interface Keplerian2D {
  a: number;
  e: number;
  /** Argument of periapsis, inertial frame (rad). */
  omega: number;
  /** Mean anomaly at the epoch (rad). */
  meanAnomaly0: number;
  /** Mean motion n = √(μ / a³) (rad/s). */
  meanMotion: number;
  period: number;
  mu: number;
  /** Sign of specific angular momentum (+1 CCW, −1 CW). */
  sense: 1 | -1;
}

export function wrapAnglePi(angle: number): number {
  let a = angle % (Math.PI * 2);
  if (a > Math.PI) a -= Math.PI * 2;
  if (a <= -Math.PI) a += Math.PI * 2;
  return a;
}

/**
 * Solve Kepler's equation E − e sin E = M with Newton–Halley.
 * Returns the eccentric anomaly in radians (not reduced to a principal interval
 * beyond the starter; callers use sin/cos so 2π wrapping is harmless).
 */
export function solveKeplerEquation(meanAnomaly: number, eccentricity: number): number {
  const e = eccentricity;
  const M = wrapAnglePi(meanAnomaly);
  if (e < CIRCULAR_ECCENTRICITY) return M;

  // Danby-style starter: circular guess for moderate e; π sign(M) for high e.
  let E = e < 0.8 ? M : Math.PI * Math.sign(M || 1);
  if (e >= 0.8 && Math.abs(M) < Math.PI / 6) E = M;

  for (let i = 0; i < KEPLER_MAX_ITERATIONS; i++) {
    const sinE = Math.sin(E);
    const cosE = Math.cos(E);
    const f = E - e * sinE - M;
    const fp = 1 - e * cosE;
    const fpp = e * sinE;
    const denom = fp * fp - 0.5 * f * fpp;
    const dE = denom !== 0 ? (f * fp) / denom : f / fp;
    E -= dE;
    if (Math.abs(dE) < KEPLER_ABS_TOL_E) return E;
  }
  return E;
}

export function keplerPeriod(semiMajorAxis: number, mu: number): number {
  return 2 * Math.PI * Math.sqrt((semiMajorAxis * semiMajorAxis * semiMajorAxis) / mu);
}

export function keplerMeanMotion(semiMajorAxis: number, mu: number): number {
  return Math.sqrt(mu / (semiMajorAxis * semiMajorAxis * semiMajorAxis));
}

export function cartesianToKepler(
  rx: number,
  ry: number,
  vx: number,
  vy: number,
  mu: number,
): Keplerian2D | { error: KeplerFailure } {
  if (![rx, ry, vx, vy, mu].every(Number.isFinite) || mu <= 0) {
    return { error: 'not_finite' };
  }

  const r = Math.hypot(rx, ry);
  if (!(r > 0) || !Number.isFinite(r)) return { error: 'not_finite' };

  const v2 = vx * vx + vy * vy;
  const energy = 0.5 * v2 - mu / r;
  if (!(energy < 0)) return { error: 'unbound' };

  const a = -mu / (2 * energy);
  if (!(a > 0) || !Number.isFinite(a)) return { error: 'non_positive_a' };

  const h = rx * vy - ry * vx;
  const hAbs = Math.abs(h);
  if (hAbs / Math.sqrt(mu * a) < MIN_SPECIFIC_ANGULAR_MOMENTUM_RATIO) {
    return { error: 'radial' };
  }

  const ex = ((v2 - mu / r) * rx - (rx * vx + ry * vy) * vx) / mu;
  const ey = ((v2 - mu / r) * ry - (rx * vx + ry * vy) * vy) / mu;
  const e = Math.hypot(ex, ey);

  if (!(e < 1) || !Number.isFinite(e)) return { error: 'not_ellipse' };

  const sense: 1 | -1 = h >= 0 ? 1 : -1;
  let omega = 0;
  let trueAnomaly: number;

  if (e < CIRCULAR_ECCENTRICITY) {
    trueAnomaly = Math.atan2(sense * ry, rx);
  } else {
    omega = Math.atan2(ey, ex);
    trueAnomaly = Math.atan2(sense * (ex * ry - ey * rx), ex * rx + ey * ry);
  }

  const cosNu = Math.cos(trueAnomaly);
  const sinNu = Math.sin(trueAnomaly);
  const eccDen = 1 + e * cosNu;
  const cosE = (e + cosNu) / eccDen;
  const sinE = (Math.sqrt(Math.max(0, 1 - e * e)) * sinNu) / eccDen;
  const E0 = Math.atan2(sinE, cosE);
  const meanAnomaly0 = wrapAnglePi(E0 - e * Math.sin(E0));
  const meanMotion = keplerMeanMotion(a, mu);

  return {
    a,
    e: e < CIRCULAR_ECCENTRICITY ? 0 : e,
    omega,
    meanAnomaly0,
    meanMotion,
    period: keplerPeriod(a, mu),
    mu,
    sense,
  };
}

export function keplerToCartesian(
  elements: Keplerian2D,
  deltaTime: number,
): { rx: number; ry: number; vx: number; vy: number } {
  const { a, e, omega, meanAnomaly0, meanMotion, mu, sense } = elements;
  const M = meanAnomaly0 + meanMotion * deltaTime;
  const E = solveKeplerEquation(M, e);
  const sinE = Math.sin(E);
  const cosE = Math.cos(E);
  const sqrtOneE2 = Math.sqrt(Math.max(0, 1 - e * e));
  const xP = a * (cosE - e);
  const yP = a * sqrtOneE2 * sinE * sense;
  const rMag = a * (1 - e * cosE);
  const nSqrtA = Math.sqrt(mu / a);
  // vis-viva form: v = √(μ a) / r * (−sin E, √(1−e²) cos E)
  const vxP = rMag > 0 ? (-nSqrtA * a * sinE) / rMag : 0;
  const vyP = rMag > 0 ? (nSqrtA * a * sqrtOneE2 * cosE * sense) / rMag : 0;

  const c = Math.cos(omega);
  const s = Math.sin(omega);
  return {
    rx: xP * c - yP * s,
    ry: xP * s + yP * c,
    vx: vxP * c - vyP * s,
    vy: vxP * s + vyP * c,
  };
}

export function specificOrbitalEnergy(
  rx: number,
  ry: number,
  vx: number,
  vy: number,
  mu: number,
): number {
  const r = Math.hypot(rx, ry);
  return 0.5 * (vx * vx + vy * vy) - mu / r;
}
