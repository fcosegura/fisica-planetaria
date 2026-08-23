/** Gravitational constant (SI) */
export const G = 6.67430e-11;

export const M_SUN = 1.989e30;
export const M_EARTH = 5.972e24;
export const M_MOON = 7.342e22;
export const AU = 1.495978707e11;
export const EARTH_ORBITAL_VELOCITY = 29_785.9;
export const EARTH_ORBITAL_PERIOD = 365.256 * 86400;

export const DEFAULT_SIM_CONFIG = {
  physicsDt: 3600,
  softening: 0,
  gravityConstant: G,
  collisionMode: 'merge' as const,
  mergeThresholdFactor: 1.0,
  solver: 'direct' as const,
  integrator: 'leapfrog-kdk' as const,
  maxSubstepsPerFrame: 10_000,
  frameBudgetMs: 8,
  simulationTimeScale: 86400,
  targetFps: 60,
  engineKind: 'nbody' as const,
};

export const TIME_SCALE_PRESETS = [
  { label: '1×', value: 1 },
  { label: '10×', value: 10 },
  { label: '100×', value: 100 },
  { label: '1,000×', value: 1_000 },
  { label: '10,000×', value: 10_000 },
  { label: '1 día/s', value: 86_400 },
  { label: '1 mes/s', value: 2_592_000 },
  { label: '1 año/s', value: 31_557_600 },
  { label: '10 años/s', value: 315_576_000 },
  { label: '100 años/s', value: 3_155_760_000 },
  { label: '1.000 años/s', value: 31_557_600_000 },
] as const;

export const FLAG_FIXED = 1;
export const FLAG_ACTIVE = 2;
