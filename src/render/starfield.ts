/** Deterministic hash for starfield placement. */
export function starfieldHash(cx: number, cy: number, seed: number): number {
  let h = (cx * 374761393 + cy * 668265263 + seed * 1274126177) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}

export interface StarfieldPoint {
  sx: number;
  sy: number;
  brightness: number;
  size: number;
}

/** Generate star points for visible screen area (deterministic). */
export function generateStarfieldPoints(
  width: number,
  height: number,
  centerX: number,
  centerY: number,
  scale: number,
  cellWorldSize: number,
): StarfieldPoint[] {
  if (scale <= 0 || !Number.isFinite(scale)) return [];

  const halfW = width / scale / 2 + cellWorldSize;
  const halfH = height / scale / 2 + cellWorldSize;
  const minCx = Math.floor((centerX - halfW) / cellWorldSize);
  const maxCx = Math.ceil((centerX + halfW) / cellWorldSize);
  const minCy = Math.floor((centerY - halfH) / cellWorldSize);
  const maxCy = Math.ceil((centerY + halfH) / cellWorldSize);

  const points: StarfieldPoint[] = [];

  for (let cx = minCx; cx <= maxCx; cx++) {
    for (let cy = minCy; cy <= maxCy; cy++) {
      const h1 = starfieldHash(cx, cy, 1);
      if ((h1 % 5) !== 0) continue;

      const h2 = starfieldHash(cx, cy, 2);
      const wx = (cx + (h2 % 1000) / 1000) * cellWorldSize;
      const wy = (cy + ((h2 >>> 10) % 1000) / 1000) * cellWorldSize;

      const sx = (wx - centerX) * scale + width / 2;
      const sy = -(wy - centerY) * scale + height / 2;

      if (sx < -4 || sx > width + 4 || sy < -4 || sy > height + 4) continue;

      const h3 = starfieldHash(cx, cy, 3);
      points.push({
        sx,
        sy,
        brightness: 0.15 + (h3 % 40) / 100,
        size: (h3 % 3) === 0 ? 1.5 : 1,
      });

      if ((h1 % 11) === 0) {
        const h4 = starfieldHash(cx, cy, 4);
        const wx2 = (cx + (h4 % 1000) / 1000) * cellWorldSize;
        const wy2 = (cy + ((h4 >>> 10) % 1000) / 1000) * cellWorldSize;
        points.push({
          sx: (wx2 - centerX) * scale + width / 2,
          sy: -(wy2 - centerY) * scale + height / 2,
          brightness: 0.1 + (h4 % 30) / 100,
          size: 1,
        });
      }
    }
  }

  return points;
}

export function drawStarfield(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  centerX: number,
  centerY: number,
  scale: number,
  worldSpan: number,
): void {
  const cellWorldSize = Math.pow(10, Math.floor(Math.log10(Math.max(worldSpan / 6, 1e6))));
  const points = generateStarfieldPoints(width, height, centerX, centerY, scale, cellWorldSize);

  ctx.save();
  for (const star of points) {
    ctx.fillStyle = `rgba(255, 255, 255, ${star.brightness})`;
    ctx.beginPath();
    ctx.arc(star.sx, star.sy, star.size * 0.5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}
