import { screenLightVector, TAU } from './visual-math';

/**
 * Soft day-side sheen. Night side stays with the baked sphere lighting —
 * a linear fill here would look like a vertical stripe.
 */
export function drawPlanetLighting(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radiusPx: number,
  lightAngle: number,
  emissive: boolean,
): void {
  if (radiusPx < 3 || emissive) return;

  const light = screenLightVector(lightAngle);
  const rimX = x + light.x * radiusPx * 0.28;
  const rimY = y + light.y * radiusPx * 0.28;

  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, radiusPx, 0, TAU);
  ctx.clip();

  const rim = ctx.createRadialGradient(rimX, rimY, radiusPx * 0.2, x, y, radiusPx);
  rim.addColorStop(0, 'rgba(255, 248, 230, 0.08)');
  rim.addColorStop(0.55, 'rgba(255, 248, 230, 0)');
  rim.addColorStop(1, 'rgba(255, 248, 230, 0)');
  ctx.fillStyle = rim;
  ctx.fillRect(x - radiusPx, y - radiusPx, radiusPx * 2, radiusPx * 2);

  ctx.restore();
}
