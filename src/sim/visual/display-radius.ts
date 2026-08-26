/**
 * Map physical radius (metres) → screen display radius (pixels).
 *
 * Relative mode: the Sun (or largest body) is the scale reference. Other
 * bodies are `sunDisplayPx * (R / R_ref)`, clamped to a readable minimum and
 * never larger than the reference disk.
 */

export const R_SUN = 6.96e8;
export const DEFAULT_RELATIVE_SUN_DISPLAY_PX = 28;
export const MIN_RELATIVE_DISPLAY_PX = 2.5;

/** Real mode: screen radius (px) of the scale reference at camera zoom = 1. */
export const DEFAULT_REAL_SUN_DISPLAY_PX = 50;
export const MIN_REAL_SUN_DISPLAY_PX = 12;
export const MAX_REAL_SUN_DISPLAY_PX = 1000;

export function relativeDisplayRadius(
  physicalRadius: number,
  referenceRadius = R_SUN,
  referenceDisplayPx = DEFAULT_RELATIVE_SUN_DISPLAY_PX,
  minPx = MIN_RELATIVE_DISPLAY_PX,
): number {
  if (!Number.isFinite(physicalRadius) || physicalRadius <= 0) return minPx;
  if (!Number.isFinite(referenceRadius) || referenceRadius <= 0) return minPx;
  if (!Number.isFinite(referenceDisplayPx) || referenceDisplayPx <= 0) return minPx;

  const px = referenceDisplayPx * (physicalRadius / referenceRadius);
  return Math.min(referenceDisplayPx, Math.max(minPx, px));
}

/** Prefer Sol/Sun by name; otherwise the body with the largest physical radius. */
export function findScaleReferenceRadius(
  bodies: ReadonlyArray<{ name: string; radius: number }>,
): number {
  if (bodies.length === 0) return R_SUN;

  const byName = bodies.find((b) => {
    const n = b.name.toLowerCase();
    return n === 'sol' || n === 'sun';
  });
  if (byName && byName.radius > 0) return byName.radius;

  let max = bodies[0]!.radius;
  for (let i = 1; i < bodies.length; i++) {
    const r = bodies[i]!.radius;
    if (r > max) max = r;
  }
  return max > 0 ? max : R_SUN;
}

/**
 * Catalog / merge helper: sun-relative with default reference size.
 * Stars (≥ 0.5 R☉ or `isStar`) get the full reference disk.
 */
export function displayRadiusFromPhysical(physicalRadius: number, isStar = false): number {
  if (!Number.isFinite(physicalRadius) || physicalRadius <= 0) return MIN_RELATIVE_DISPLAY_PX;

  if (isStar || physicalRadius >= R_SUN * 0.5) {
    return DEFAULT_RELATIVE_SUN_DISPLAY_PX;
  }

  return relativeDisplayRadius(physicalRadius);
}

/** Pixels per metre at camera zoom = 1 in real (sun-relative) mode. */
export function realPxPerMeter(referenceDisplayPx: number, referenceRadius: number): number {
  if (!Number.isFinite(referenceDisplayPx) || referenceDisplayPx <= 0) return 0;
  if (!Number.isFinite(referenceRadius) || referenceRadius <= 0) return 0;
  return referenceDisplayPx / referenceRadius;
}

/** Exact sun-relative disk radius at camera zoom = 1; no readable minimum. */
export function realDisplayRadius(
  physicalRadius: number,
  referenceDisplayPx: number,
  referenceRadius: number,
): number {
  if (!Number.isFinite(physicalRadius) || physicalRadius <= 0) return 0;
  return physicalRadius * realPxPerMeter(referenceDisplayPx, referenceRadius);
}
