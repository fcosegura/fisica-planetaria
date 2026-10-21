import type { SnapshotBody } from '@/sim/types';
import { resolveBodyTextureKind } from './body-textures';

export const MIN_EFFECT_RADIUS_PX = 4;

export interface AtmosphereProfile {
  color: string;
  intensity: number;
  /** Outer atmosphere as a fraction of disc radius minus 1 (e.g. 0.1 → 1.1). */
  thickness: number;
  scattering: number;
  nightGlow: number;
  innerRatio: number;
  outerRatio: number;
}

export interface RingBandSpec {
  innerRatio: number;
  outerRatio: number;
  density: number;
  color: string;
}

export interface RingGap {
  innerRatio: number;
  outerRatio: number;
  /** Residual density inside the gap (dust), 0–1. */
  residual: number;
}

export interface RingProfile {
  id: string;
  /**
   * Y-scale of the ring disc. The lab is a top-down 2D view of the orbital
   * plane, so this is 1 (face-on circles). Values < 1 would fake a 3D tilt.
   */
  tilt: number;
  innerRatio: number;
  maxOuterRatio: number;
  bands: RingBandSpec[];
  gaps: RingGap[];
  ringletScale: number;
  ringletAmplitude: number;
  opacity: number;
  shadowOpacity: number;
}

export interface GasBandProfile {
  intensity: number;
  bandCount: number;
  waviness: number;
  /** Visual-time drift in rad/ms; must stay almost subliminal. */
  driftSpeed: number;
  contrast: number;
}

function nameOf(body: SnapshotBody): string {
  return body.name.toLowerCase();
}

function includesAny(name: string, needles: readonly string[]): boolean {
  return needles.some((n) => name.includes(n));
}

export function isStarBody(body: Pick<SnapshotBody, 'mass' | 'name'>): boolean {
  const name = body.name.toLowerCase();
  return body.mass >= 1e29 || name.includes('sol') || name.includes('sun');
}

export function shouldDrawEffects(radiusPx: number): boolean {
  return radiusPx >= MIN_EFFECT_RADIUS_PX;
}

export function resolveAtmosphereProfile(body: SnapshotBody, radiusPx: number): AtmosphereProfile | null {
  if (!shouldDrawEffects(radiusPx)) return null;

  const name = nameOf(body);
  const kind = resolveBodyTextureKind(body);

  if (includesAny(name, ['luna', 'moon']) && !includesAny(name, ['titán', 'titan'])) {
    return null;
  }

  if (includesAny(name, ['tierra', 'earth']) || kind === 'earth') {
    return {
      color: '#60a5fa',
      intensity: 1,
      thickness: 0.1,
      scattering: 0.92,
      nightGlow: 0.12,
      innerRatio: 1,
      outerRatio: 1.1,
    };
  }

  if (includesAny(name, ['venus']) || kind === 'venus') {
    return {
      color: '#fbbf24',
      intensity: 1.15,
      thickness: 0.18,
      scattering: 0.7,
      nightGlow: 0.28,
      innerRatio: 1,
      outerRatio: 1.18,
    };
  }

  if (includesAny(name, ['marte', 'mars']) || kind === 'mars') {
    return {
      color: '#f87171',
      intensity: 0.45,
      thickness: 0.05,
      scattering: 0.4,
      nightGlow: 0.06,
      innerRatio: 1,
      outerRatio: 1.05,
    };
  }

  if (includesAny(name, ['titán', 'titan'])) {
    return {
      color: '#fb923c',
      intensity: 0.95,
      thickness: 0.16,
      scattering: 0.55,
      nightGlow: 0.22,
      innerRatio: 1,
      outerRatio: 1.16,
    };
  }

  if (includesAny(name, ['júpiter', 'jupiter'])) {
    return {
      color: '#d4a574',
      intensity: 0.38,
      thickness: 0.08,
      scattering: 0.28,
      nightGlow: 0.08,
      innerRatio: 1,
      outerRatio: 1.08,
    };
  }

  if (includesAny(name, ['saturno', 'saturn'])) {
    return {
      color: '#e8d5a3',
      intensity: 0.32,
      thickness: 0.07,
      scattering: 0.22,
      nightGlow: 0.08,
      innerRatio: 1,
      outerRatio: 1.07,
    };
  }

  if (includesAny(name, ['urano', 'uranus'])) {
    return {
      color: '#67e8f9',
      intensity: 0.22,
      thickness: 0.05,
      scattering: 0.18,
      nightGlow: 0.06,
      innerRatio: 1,
      outerRatio: 1.05,
    };
  }

  if (includesAny(name, ['neptuno', 'neptune'])) {
    return {
      color: '#38bdf8',
      intensity: 0.34,
      thickness: 0.06,
      scattering: 0.28,
      nightGlow: 0.08,
      innerRatio: 1,
      outerRatio: 1.06,
    };
  }

  return null;
}

export function resolveRingProfile(body: SnapshotBody, radiusPx: number): RingProfile | null {
  if (!shouldDrawEffects(radiusPx)) return null;

  const name = nameOf(body);

  if (includesAny(name, ['saturno', 'saturn'])) {
    return {
      id: 'saturn',
      tilt: 1,
      innerRatio: 1.11,
      maxOuterRatio: 2.32,
      opacity: 0.82,
      shadowOpacity: 0.2,
      ringletScale: 42,
      ringletAmplitude: 0.22,
      bands: [
        { innerRatio: 1.11, outerRatio: 1.235, density: 0.28, color: '#c4b089' },
        { innerRatio: 1.235, outerRatio: 1.525, density: 0.48, color: '#d4c4a0' },
        { innerRatio: 1.525, outerRatio: 1.95, density: 1, color: '#e8d5a3' },
        { innerRatio: 2.023, outerRatio: 2.27, density: 0.72, color: '#d4c08a' },
        { innerRatio: 2.3, outerRatio: 2.32, density: 0.4, color: '#efe6c8' },
      ],
      gaps: [
        { innerRatio: 1.95, outerRatio: 2.023, residual: 0.045 },
        { innerRatio: 2.214, outerRatio: 2.226, residual: 0.06 },
      ],
    };
  }

  if (includesAny(name, ['urano', 'uranus'])) {
    return {
      id: 'uranus',
      tilt: 1,
      innerRatio: 1.55,
      maxOuterRatio: 1.95,
      opacity: 0.42,
      shadowOpacity: 0.1,
      ringletScale: 70,
      ringletAmplitude: 0.35,
      bands: [
        { innerRatio: 1.55, outerRatio: 1.62, density: 0.55, color: '#94a3b8' },
        { innerRatio: 1.68, outerRatio: 1.74, density: 0.7, color: '#cbd5e1' },
        { innerRatio: 1.8, outerRatio: 1.85, density: 0.5, color: '#94a3b8' },
        { innerRatio: 1.9, outerRatio: 1.95, density: 0.38, color: '#64748b' },
      ],
      gaps: [
        { innerRatio: 1.62, outerRatio: 1.68, residual: 0.02 },
        { innerRatio: 1.74, outerRatio: 1.8, residual: 0.02 },
        { innerRatio: 1.85, outerRatio: 1.9, residual: 0.015 },
      ],
    };
  }

  if (radiusPx < 8) return null;

  return null;
}

export function resolveGasBandProfile(body: SnapshotBody, radiusPx: number): GasBandProfile | null {
  if (radiusPx < 8) return null;

  const name = nameOf(body);

  if (includesAny(name, ['júpiter', 'jupiter'])) {
    return { intensity: 0.11, bandCount: 11, waviness: 0.012, driftSpeed: 0.000012, contrast: 0.65 };
  }

  if (includesAny(name, ['saturno', 'saturn'])) {
    return { intensity: 0.045, bandCount: 8, waviness: 0.008, driftSpeed: 0.000008, contrast: 0.35 };
  }

  if (includesAny(name, ['urano', 'uranus'])) {
    return { intensity: 0.022, bandCount: 5, waviness: 0.004, driftSpeed: 0.000004, contrast: 0.18 };
  }

  if (includesAny(name, ['neptuno', 'neptune'])) {
    return { intensity: 0.028, bandCount: 6, waviness: 0.005, driftSpeed: 0.000005, contrast: 0.22 };
  }

  return null;
}
