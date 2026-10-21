import type { GasBandProfile } from './body-visual-profiles';
import { seedFromId } from './body-textures';
import { TAU, unitHash } from './visual-math';

export function drawGasGiantBands(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  discRadius: number,
  profile: GasBandProfile,
  bodyId: string,
  visualTimeMs: number,
): void {
  if (discRadius < 8 || profile.intensity <= 0) return;

  const seed = seedFromId(bodyId);
  const drift = Math.sin(visualTimeMs * profile.driftSpeed + seed * 0.0001) * discRadius * 0.012;

  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, discRadius, 0, TAU);
  ctx.clip();

  for (let i = 0; i < profile.bandCount; i++) {
    const u = unitHash(seed + i * 97);
    const v = unitHash(seed + i * 193 + 3);
    const cy = y - discRadius + ((i + 0.5) / profile.bandCount) * discRadius * 2 + drift * (0.4 + u);
    const halfH = discRadius * (0.035 + 0.055 * v) * (0.7 + profile.contrast);
    const wave = discRadius * profile.waviness * (0.6 + u);
    const dark = u > 0.48;
    const alpha = profile.intensity * (0.35 + 0.65 * v);

    ctx.beginPath();
    const steps = 10;
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const px = x - discRadius + t * discRadius * 2;
      const py = cy - halfH + Math.sin(t * Math.PI * 2 + u * 6 + visualTimeMs * profile.driftSpeed * 0.4) * wave;
      if (s === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    for (let s = steps; s >= 0; s--) {
      const t = s / steps;
      const px = x - discRadius + t * discRadius * 2;
      const py = cy + halfH + Math.sin(t * Math.PI * 2 + u * 6 + 0.7 + visualTimeMs * profile.driftSpeed * 0.4) * wave * 0.7;
      ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fillStyle = dark ? `rgba(20, 16, 12, ${alpha})` : `rgba(255, 244, 220, ${alpha * 0.85})`;
    ctx.fill();
  }

  if (profile.contrast > 0.5 && discRadius >= 14) {
    const spotU = unitHash(seed + 901);
    const sx = x + (spotU - 0.5) * discRadius * 0.7;
    const sy = y + (unitHash(seed + 902) - 0.45) * discRadius * 0.5;
    const rx = discRadius * (0.09 + 0.05 * unitHash(seed + 903));
    const ry = rx * 0.62;
    ctx.fillStyle = `rgba(140, 52, 28, ${profile.intensity * 0.55})`;
    ctx.beginPath();
    ctx.ellipse(sx, sy, rx, ry, 0.15, 0, TAU);
    ctx.fill();
  }

  ctx.restore();
}
