import type { SnapshotBody } from '@/sim/types';
import { drawTexturedBodyDisc, lightAngleFromSun, resolveBodyTextureKind } from './body-textures';
import { drawPlanetLighting } from './planet-lighting';
import {
  isStarBody,
  resolveAtmosphereProfile,
  resolveRingProfile,
  type AtmosphereProfile,
  type RingProfile,
} from './body-visual-profiles';
import { drawAtmosphere } from './planet-atmosphere';
import { drawRingSystem, effectiveRingExtent } from './ring-system';
import { computeSolarCorona, computeSolarWaves, drawSolarCorona, drawSolarWaves } from './solar-effects';
import { starfieldHash, generateStarfieldPoints, drawStarfield } from './starfield';

export { MIN_EFFECT_RADIUS_PX, isStarBody, shouldDrawEffects } from './body-visual-profiles';
export {
  resolveAtmosphereProfile,
  resolveGasBandProfile,
  resolveRingProfile,
  type AtmosphereProfile,
  type GasBandProfile,
  type RingBandSpec as RingBand,
  type RingProfile,
} from './body-visual-profiles';
export {
  atmosphereIntensity,
  drawAtmosphere,
  drawAtmosphereHalo,
  limbFactor,
  solarFactor,
} from './planet-atmosphere';
export {
  clearRingMapCache,
  drawPlanetRings,
  drawRingShadow,
  drawRingSystem,
  ringDensity,
  ringLightingFactor,
  ringSolarIllumination,
} from './ring-system';
export {
  computeSolarCorona,
  computeSolarWaves,
  drawSolarCorona,
  drawSolarWaves,
  type SolarCorona,
  type SolarWave,
} from './solar-effects';
export { drawPlanetLighting } from './planet-lighting';
export { lightAngleFromSun };
export { drawStarfield, generateStarfieldPoints, starfieldHash };
export type { StarfieldPoint } from './starfield';

export function effectiveBodyHitRadius(
  discRadiusPx: number,
  ringProfile: RingProfile | null,
): number {
  const disc = Math.max(8, discRadiusPx) + 4;
  if (!ringProfile) return disc;
  return Math.max(disc, discRadiusPx * effectiveRingExtent(ringProfile) + 4);
}

export interface DrawBodyPipelineOptions {
  sunWorldPosition: { x: number; y: number } | null;
  visualTimeMs: number;
  reduceMotion: boolean;
}

/**
 * Visual composition for one body (no physics).
 *
 * texture → lighting → terminator → atmosphere → body-specific → ring occlusion
 */
export function drawBodyVisualPipeline(
  ctx: CanvasRenderingContext2D,
  body: SnapshotBody,
  x: number,
  y: number,
  radiusPx: number,
  options: DrawBodyPipelineOptions,
): { ringProfile: RingProfile | null; atmosphereProfile: AtmosphereProfile | null } {
  const star = isStarBody(body);
  const ringProfile = resolveRingProfile(body, radiusPx);
  const atmosphereProfile = resolveAtmosphereProfile(body, radiusPx);
  const lightAngle = lightAngleFromSun(body, options.sunWorldPosition);
  const visualTime = options.reduceMotion ? 0 : options.visualTimeMs;

  if (star) {
    const corona = computeSolarCorona(visualTime, Math.max(radiusPx, 4));
    drawSolarCorona(ctx, x, y, corona);
    if (!options.reduceMotion) {
      drawSolarWaves(ctx, x, y, computeSolarWaves(visualTime, Math.max(radiusPx, 4)));
    }
  }

  drawTexturedBodyDisc(ctx, body, x, y, radiusPx, { sunWorldPosition: options.sunWorldPosition });
  drawPlanetLighting(ctx, x, y, radiusPx, lightAngle, resolveBodyTextureKind(body) === 'star');

  if (atmosphereProfile) {
    drawAtmosphere(ctx, x, y, radiusPx, atmosphereProfile, lightAngle, visualTime);
  }

  if (ringProfile) {
    drawRingSystem(ctx, x, y, radiusPx, ringProfile, lightAngle);
  }

  return { ringProfile, atmosphereProfile };
}
