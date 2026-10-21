import { TAU } from './visual-math';

export interface SolarCorona {
  innerRadius: number;
  outerRadius: number;
  pulse: number;
}

export interface SolarWave {
  radius: number;
  alpha: number;
}

const WAVE_COUNT = 3;
const WAVE_PERIOD_MS = 5200;
const WAVE_MIN_RATIO = 1.15;
const WAVE_MAX_RATIO = 2.35;

export function computeSolarCorona(timeMs: number, radiusPx: number): SolarCorona {
  const pulse = 0.5 + 0.5 * Math.sin(timeMs * 0.0009);
  return {
    innerRadius: Math.max(1, radiusPx * 0.28),
    outerRadius: Math.max(radiusPx * 1.65, radiusPx + 14) + pulse * radiusPx * 0.22,
    pulse,
  };
}

export function computeSolarWaves(timeMs: number, radiusPx: number): SolarWave[] {
  const waves: SolarWave[] = [];
  const slot = WAVE_PERIOD_MS / WAVE_COUNT;

  for (let i = 0; i < WAVE_COUNT; i++) {
    const phase = ((timeMs + i * slot) % WAVE_PERIOD_MS) / WAVE_PERIOD_MS;
    waves.push({
      radius: radiusPx * (WAVE_MIN_RATIO + phase * (WAVE_MAX_RATIO - WAVE_MIN_RATIO)),
      alpha: 0.22 * (1 - phase),
    });
  }

  return waves;
}

export function drawSolarCorona(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  corona: SolarCorona,
): void {
  const pulse = corona.pulse;

  const outer = ctx.createRadialGradient(x, y, corona.innerRadius, x, y, corona.outerRadius);
  outer.addColorStop(0, `rgba(255, 214, 102, ${0.38 + pulse * 0.12})`);
  outer.addColorStop(0.35, `rgba(251, 191, 36, ${0.2 + pulse * 0.08})`);
  outer.addColorStop(0.7, `rgba(245, 158, 11, ${0.08 + pulse * 0.04})`);
  outer.addColorStop(1, 'rgba(245, 158, 11, 0)');
  ctx.fillStyle = outer;
  ctx.beginPath();
  ctx.arc(x, y, corona.outerRadius, 0, TAU);
  ctx.fill();

  const inner = ctx.createRadialGradient(x, y, 0, x, y, corona.innerRadius * 1.8);
  inner.addColorStop(0, `rgba(255, 251, 235, ${0.28 + pulse * 0.08})`);
  inner.addColorStop(1, 'rgba(255, 251, 235, 0)');
  ctx.fillStyle = inner;
  ctx.beginPath();
  ctx.arc(x, y, corona.innerRadius * 1.8, 0, TAU);
  ctx.fill();
}

export function drawSolarWaves(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  waves: SolarWave[],
): void {
  ctx.save();
  for (const wave of waves) {
    if (wave.alpha <= 0.01) continue;
    ctx.strokeStyle = `rgba(251, 191, 36, ${wave.alpha})`;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(x, y, wave.radius, 0, TAU);
    ctx.stroke();
  }
  ctx.restore();
}
