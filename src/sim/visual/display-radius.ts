/**
 * Map physical radius (metres) → screen display radius (pixels).
 *
 * True scale at 1 AU makes Earth invisible (~0.04 px). We use a log
 * exaggeration so relative sizes remain readable while staying ordered:
 * Moon < Mercury < Mars < Venus ≈ Earth ≪ Jupiter < Saturn ≪ Sun.
 */

const R_EARTH = 6.371e6;
const R_SUN = 6.96e8;

export function displayRadiusFromPhysical(physicalRadius: number, isStar = false): number {
  if (!Number.isFinite(physicalRadius) || physicalRadius <= 0) return 6;

  if (isStar || physicalRadius >= R_SUN * 0.5) {
    // Sun: large but not dominating the whole canvas
    return 22;
  }

  // Log scale relative to Earth: Earth ≈ 8 px, Jupiter ≈ 16 px, Moon ≈ 5 px
  const ratio = physicalRadius / R_EARTH;
  const px = 6 + 10 * Math.log10(ratio + 0.05);
  return Math.max(4, Math.min(18, px));
}
