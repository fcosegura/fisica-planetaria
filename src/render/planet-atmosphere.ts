import type { AtmosphereProfile } from './body-visual-profiles';
import { shouldDrawEffects } from './body-visual-profiles';
import { clamp, rgbaFromHex, screenLightVector, smoothstep } from './visual-math';

/** Distance-to-limb term: peaks at the disc edge, fades through the atmosphere shell. */
export function limbFactor(distFromCenter: number, radius: number, thickness: number): number {
  if (radius <= 0) return 0;
  const n = distFromCenter / radius;
  if (n < 0.78) return 0;
  if (n <= 1) return smoothstep(0.78, 1, n);
  return 1 - smoothstep(1, 1 + Math.max(0.02, thickness), n);
}

/** How much the local "normal" faces the Sun (0–1), with residual night glow. */
export function solarFactor(
  nx: number,
  ny: number,
  lightAngle: number,
  nightGlow: number,
): number {
  const lx = Math.cos(lightAngle);
  const ly = Math.sin(lightAngle);
  const ndotl = nx * lx + ny * ly;
  const day = smoothstep(-0.18, 0.42, ndotl);
  const glow = clamp(nightGlow, 0, 0.5);
  return glow + (1 - glow) * (0.22 + 0.78 * day);
}

export function atmosphereIntensity(
  limb: number,
  solar: number,
  profile: Pick<AtmosphereProfile, 'intensity'>,
): number {
  return limb * solar * profile.intensity;
}

/**
 * Soft limb + outer haze only. No linear terminator bar and no fill on the
 * disc interior — those read as stripes on every planet with an atmosphere.
 */
export function drawAtmosphere(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  discRadius: number,
  profile: AtmosphereProfile,
  lightAngle: number,
  visualTimeMs = 0,
): void {
  if (!shouldDrawEffects(discRadius)) return;

  const outerR = discRadius * profile.outerRatio;
  const light = screenLightVector(lightAngle);
  const hazePulse = 1 + 0.02 * Math.sin(visualTimeMs * 0.00035);
  const scatter = profile.scattering * hazePulse;
  const rimAlpha = profile.intensity * 0.18 * scatter;

  ctx.save();
  const shell = ctx.createRadialGradient(x, y, discRadius * 0.96, x, y, outerR);
  shell.addColorStop(0, rgbaFromHex(profile.color, 0));
  shell.addColorStop(0.35, rgbaFromHex(profile.color, rimAlpha * 0.45));
  shell.addColorStop(1, rgbaFromHex(profile.color, 0));
  ctx.beginPath();
  ctx.arc(x, y, outerR, 0, Math.PI * 2);
  ctx.arc(x, y, discRadius * 0.96, 0, Math.PI * 2);
  ctx.fillStyle = shell;
  ctx.fill('evenodd');
  ctx.restore();

  ctx.save();
  const dayCx = x + light.x * discRadius * 0.55;
  const dayCy = y + light.y * discRadius * 0.55;
  const dayRim = ctx.createRadialGradient(dayCx, dayCy, discRadius * 0.2, x, y, outerR);
  dayRim.addColorStop(0, rgbaFromHex(profile.color, 0));
  dayRim.addColorStop(0.62, rgbaFromHex(profile.color, 0));
  dayRim.addColorStop(0.82, rgbaFromHex(profile.color, rimAlpha * 0.7));
  dayRim.addColorStop(1, rgbaFromHex(profile.color, 0));
  ctx.beginPath();
  ctx.arc(x, y, outerR, 0, Math.PI * 2);
  ctx.arc(x, y, discRadius * 0.97, 0, Math.PI * 2);
  ctx.fillStyle = dayRim;
  ctx.fill('evenodd');
  ctx.restore();
}

export function drawAtmosphereHalo(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  discRadius: number,
  profile: AtmosphereProfile,
  lightAngle = -Math.PI * 0.25,
  visualTimeMs = 0,
): void {
  drawAtmosphere(ctx, x, y, discRadius, profile, lightAngle, visualTimeMs);
}
