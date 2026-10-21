export const TAU = Math.PI * 2;

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

/** Deterministic 0..1 hash from an integer-ish key. */
export function unitHash(n: number): number {
  let x = Math.imul(n | 0, 374761393);
  x = Math.imul(x ^ (x >>> 13), 1274126177);
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
}

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

export function parseHexColor(hex: string): Rgb {
  const h = hex.replace('#', '');
  if (h.length === 3) {
    return {
      r: parseInt(h[0]! + h[0], 16),
      g: parseInt(h[1]! + h[1], 16),
      b: parseInt(h[2]! + h[2], 16),
    };
  }
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

export function rgbaFromHex(hex: string, alpha: number): string {
  const { r, g, b } = parseHexColor(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * Light direction in screen pixels.
 * `lightAngle` is computed in world space; canvas Y is inverted vs world Y.
 */
export function screenLightVector(lightAngle: number): { x: number; y: number } {
  return {
    x: Math.cos(lightAngle),
    y: -Math.sin(lightAngle),
  };
}

export function worldLightVector(lightAngle: number): { x: number; y: number } {
  return {
    x: Math.cos(lightAngle),
    y: Math.sin(lightAngle),
  };
}
