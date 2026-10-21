import type { RingBandSpec, RingProfile } from './body-visual-profiles';
import { shouldDrawEffects } from './body-visual-profiles';
import { clamp, parseHexColor, screenLightVector, TAU, unitHash } from './visual-math';

const ringMapCache = new Map<string, HTMLCanvasElement>();

export function ringDensity(radiusRatio: number, profile: RingProfile): number {
  if (radiusRatio < profile.innerRatio || radiusRatio > profile.maxOuterRatio) return 0;

  for (const gap of profile.gaps) {
    if (radiusRatio >= gap.innerRatio && radiusRatio <= gap.outerRatio) {
      return gap.residual;
    }
  }

  let density = 0;
  for (const band of profile.bands) {
    if (radiusRatio < band.innerRatio || radiusRatio > band.outerRatio) continue;
    const span = Math.max(1e-6, band.outerRatio - band.innerRatio);
    const t = (radiusRatio - band.innerRatio) / span;
    const edge = Math.sin(Math.PI * clamp(t, 0, 1));
    density = Math.max(density, band.density * (0.52 + 0.48 * edge));
  }

  if (density <= 0) return 0;

  const coarse = unitHash(Math.floor(radiusRatio * profile.ringletScale * 1000));
  const fine = unitHash(Math.floor(radiusRatio * profile.ringletScale * 7400) + 17);
  density *= 1 - profile.ringletAmplitude * 0.55 + profile.ringletAmplitude * coarse;
  density *= 0.9 + 0.1 * fine;
  return clamp(density, 0, 1);
}

export function ringSolarIllumination(lightAngle: number): number {
  const lx = Math.cos(lightAngle);
  return 0.38 + 0.62 * (0.5 + 0.5 * lx);
}

export function ringLightingFactor(lightAngle: number): number {
  return ringSolarIllumination(lightAngle);
}

export function effectiveRingExtent(profile: RingProfile): number {
  return profile.maxOuterRatio;
}

function sampleBandColor(radiusRatio: number, profile: RingProfile): RingBandSpec['color'] {
  for (const band of profile.bands) {
    if (radiusRatio >= band.innerRatio && radiusRatio <= band.outerRatio) return band.color;
  }
  return profile.bands[0]?.color ?? '#d4c4a0';
}

function ringMapSize(discRadius: number, maxOuter: number): number {
  const px = discRadius * maxOuter * 2;
  if (px > 420) return 512;
  if (px > 180) return 384;
  return 256;
}

function getRingMap(
  profile: RingProfile,
  size: number,
  kind: 'color' | 'shadow' = 'color',
): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null;

  const key = `${profile.id}|${size}|${kind}`;
  const cached = ringMapCache.get(key);
  if (cached) return cached;

  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const image = ctx.createImageData(size, size);
  const data = image.data;
  const half = size / 2;
  const maxR = profile.maxOuterRatio;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - half + 0.5;
      const dy = y - half + 0.5;
      const dist = Math.hypot(dx, dy) / half;
      const idx = (y * size + x) * 4;
      if (dist > 1) continue;

      const ratio = dist * maxR;
      const density = ringDensity(ratio, profile);
      if (density <= 0.004) continue;

      if (kind === 'shadow') {
        data[idx] = 18;
        data[idx + 1] = 16;
        data[idx + 2] = 28;
        data[idx + 3] = Math.round(255 * density * profile.opacity);
      } else {
        const rgb = parseHexColor(sampleBandColor(ratio, profile));
        data[idx] = rgb.r;
        data[idx + 1] = rgb.g;
        data[idx + 2] = rgb.b;
        data[idx + 3] = Math.round(255 * density * profile.opacity);
      }
    }
  }

  ctx.putImageData(image, 0, 0);
  ringMapCache.set(key, canvas);
  return canvas;
}

function clipRingAnnulus(
  ctx: CanvasRenderingContext2D,
  discRadius: number,
  profile: RingProfile,
): void {
  const innerR = discRadius * profile.innerRatio;
  const outerR = discRadius * profile.maxOuterRatio;
  ctx.beginPath();
  ctx.arc(0, 0, outerR, 0, TAU);
  ctx.arc(0, 0, innerR, 0, TAU);
  ctx.clip('evenodd');
}

function drawRingStrokes(
  ctx: CanvasRenderingContext2D,
  discRadius: number,
  profile: RingProfile,
  lighting: number,
): void {
  const span = profile.maxOuterRatio - profile.innerRatio;
  const steps = Math.min(140, Math.max(28, Math.round(discRadius * span * 1.35)));

  for (let i = 0; i < steps; i++) {
    const ratio = profile.innerRatio + ((i + 0.5) / steps) * span;
    const density = ringDensity(ratio, profile);
    if (density < 0.02) continue;

    const rgb = parseHexColor(sampleBandColor(ratio, profile));
    ctx.strokeStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${density * profile.opacity * lighting})`;
    ctx.lineWidth = Math.max(0.6, (discRadius * span) / steps);
    ctx.beginPath();
    ctx.arc(0, 0, discRadius * ratio, 0, TAU);
    ctx.stroke();
  }
}

export function drawRingSystem(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  discRadius: number,
  profile: RingProfile,
  lightAngle: number,
): void {
  if (!shouldDrawEffects(discRadius)) return;

  const maxR = discRadius * profile.maxOuterRatio;
  const lighting = ringSolarIllumination(lightAngle);
  const map = discRadius >= 12 ? getRingMap(profile, ringMapSize(discRadius, profile.maxOuterRatio), 'color') : null;

  ctx.save();
  ctx.translate(x, y);
  if (profile.tilt !== 1) ctx.scale(1, profile.tilt);
  clipRingAnnulus(ctx, discRadius, profile);

  if (map) {
    ctx.globalAlpha = lighting;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(map, -maxR, -maxR, maxR * 2, maxR * 2);
    ctx.globalAlpha = 1;
  } else {
    drawRingStrokes(ctx, discRadius, profile, lighting);
  }

  ctx.restore();
}

export function drawPlanetRings(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  discRadius: number,
  profile: RingProfile,
  lightAngle: number,
  _half?: 'back' | 'front',
): void {
  drawRingSystem(ctx, x, y, discRadius, profile, lightAngle);
}

export function drawRingShadow(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  discRadius: number,
  profile: RingProfile,
  lightAngle: number,
): void {
  // Face-on rings in the orbital plane sit outside the disc (innerRatio > 1)
  // and do not cast a 3D band across the planet.
  if (profile.tilt >= 0.95 || profile.innerRatio >= 1) return;
  if (!shouldDrawEffects(discRadius) || profile.shadowOpacity <= 0.01) return;

  const light = screenLightVector(lightAngle);
  const maxR = discRadius * profile.maxOuterRatio;
  const illumination = ringSolarIllumination(lightAngle);
  const alpha = profile.shadowOpacity * (0.55 + 0.45 * illumination);

  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, discRadius, 0, TAU);
  ctx.clip();
  ctx.translate(x - light.x * discRadius * 0.06, y - light.y * discRadius * 0.06);
  ctx.scale(1, profile.tilt);

  const mapSize = ringMapSize(discRadius, profile.maxOuterRatio);
  const map = discRadius >= 12 ? getRingMap(profile, mapSize, 'shadow') : null;
  if (map) {
    ctx.globalCompositeOperation = 'multiply';
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.arc(0, 0, maxR, 0, TAU);
    ctx.clip();
    ctx.drawImage(map, -maxR, -maxR, maxR * 2, maxR * 2);
  } else {
    ctx.fillStyle = `rgba(12, 14, 22, ${alpha})`;
    ctx.beginPath();
    ctx.arc(0, 0, discRadius * profile.maxOuterRatio, 0, TAU);
    ctx.arc(0, 0, discRadius * profile.innerRatio, 0, TAU);
    ctx.fill('evenodd');
  }

  ctx.restore();
}

export function clearRingMapCache(): void {
  ringMapCache.clear();
}
