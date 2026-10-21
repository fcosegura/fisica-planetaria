import type { BodyTextureKind, SnapshotBody, Vec2 } from '@/sim/types';

export type { BodyTextureKind };

const DISC_CACHE_SIZE = 256;
const MIN_TEXTURE_RADIUS_PX = 3;
/** Equirectangular maps are downsampled to this width when decoded. */
const MAX_SOURCE_TEXTURE_WIDTH = 1024;

export interface DrawBodySurfaceOptions {
  /** World position of the primary light source (usually the Sun). */
  sunWorldPosition?: Vec2 | null;
}

interface Rgb {
  r: number;
  g: number;
  b: number;
}

interface LoadedTexture {
  path: string;
  width: number;
  height: number;
  pixels: Uint8ClampedArray;
}

const textureSources = new Map<string, LoadedTexture>();
const loadPromises = new Map<string, Promise<LoadedTexture | null>>();
const discCache = new Map<string, HTMLCanvasElement>();

const TEXTURE_PATHS: Record<BodyTextureKind, string> = {
  star: '/textures/planets/sun.jpg',
  earth: '/textures/planets/earth.jpg',
  venus: '/textures/planets/venus.jpg',
  mars: '/textures/planets/mars.jpg',
  gasBand: '/textures/planets/jupiter.jpg',
  iceGiant: '/textures/planets/uranus.jpg',
  icy: '/textures/planets/moon.jpg',
  rocky: '/textures/planets/mercury.jpg',
};

export function seedFromId(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function isStarBody(body: Pick<SnapshotBody, 'mass' | 'name'>): boolean {
  const name = body.name.toLowerCase();
  return body.mass >= 1e29 || name.includes('sol') || name.includes('sun');
}

function inferKindFromName(name: string): BodyTextureKind | null {
  const n = name.toLowerCase();
  if (n.includes('sol') || n.includes('sun')) return 'star';
  if (n.includes('tierra') || n.includes('earth')) return 'earth';
  if (n.includes('venus')) return 'venus';
  if (n.includes('marte') || n.includes('mars')) return 'mars';
  if (n.includes('júpiter') || n.includes('jupiter')) return 'gasBand';
  if (n.includes('saturno') || n.includes('saturn')) return 'gasBand';
  if (n.includes('urano') || n.includes('uranus')) return 'iceGiant';
  if (n.includes('neptuno') || n.includes('neptune')) return 'iceGiant';
  if (n.includes('luna') || n.includes('moon')) return 'rocky';
  return null;
}

export function resolveBodyTextureKind(body: SnapshotBody): BodyTextureKind {
  if (body.visual.textureKind) return body.visual.textureKind;
  if (isStarBody(body)) return 'star';
  const inferred = inferKindFromName(body.name);
  if (inferred) return inferred;
  const idLower = body.id.toLowerCase();
  if (idLower.startsWith('kbo') || idLower.includes('kbo')) return 'icy';
  if (idLower.startsWith('ast') || idLower.includes('asteroid')) return 'rocky';
  return 'rocky';
}

/** Resolve photo map path for a body (exported for tests). */
export function texturePathForBody(body: SnapshotBody): string {
  const kind = resolveBodyTextureKind(body);
  const name = body.name.toLowerCase();

  if (kind === 'gasBand') {
    if (name.includes('saturno') || name.includes('saturn')) {
      return '/textures/planets/saturn.jpg';
    }
    return '/textures/planets/jupiter.jpg';
  }

  if (kind === 'iceGiant') {
    if (name.includes('neptuno') || name.includes('neptune')) {
      return '/textures/planets/neptune.jpg';
    }
    return '/textures/planets/uranus.jpg';
  }

  return TEXTURE_PATHS[kind];
}

export function lightAngleFromSun(body: SnapshotBody, sunWorldPosition?: Vec2 | null): number {
  if (!sunWorldPosition) return -Math.PI * 0.25;
  return Math.atan2(
    sunWorldPosition.y - body.position.y,
    sunWorldPosition.x - body.position.x,
  );
}

function clampByte(v: number): number {
  return Math.max(0, Math.min(255, Math.round(v)));
}

function sampleBilinear(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  u: number,
  v: number,
): Rgb {
  const x = Math.max(0, Math.min(width - 1, u * (width - 1)));
  const y = Math.max(0, Math.min(height - 1, v * (height - 1)));
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(width - 1, x0 + 1);
  const y1 = Math.min(height - 1, y0 + 1);
  const fx = x - x0;
  const fy = y - y0;

  const i00 = (y0 * width + x0) * 4;
  const i10 = (y0 * width + x1) * 4;
  const i01 = (y1 * width + x0) * 4;
  const i11 = (y1 * width + x1) * 4;

  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
  const r = lerp(lerp(pixels[i00]!, pixels[i10]!, fx), lerp(pixels[i01]!, pixels[i11]!, fx), fy);
  const g = lerp(lerp(pixels[i00 + 1]!, pixels[i10 + 1]!, fx), lerp(pixels[i01 + 1]!, pixels[i11 + 1]!, fx), fy);
  const b = lerp(lerp(pixels[i00 + 2]!, pixels[i10 + 2]!, fx), lerp(pixels[i01 + 2]!, pixels[i11 + 2]!, fx), fy);
  return { r, g, b };
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/**
 * Sun shading factor in [0, 1] for an orthographic sphere normal. It depends
 * only on n·l and nz, so the shade for light angle θ is the θ = 0 shade
 * rotated by θ (exported for tests).
 */
export function sunShade(nx: number, ny: number, nz: number, lightAngle: number): number {
  const lx = Math.cos(lightAngle);
  const ly = Math.sin(lightAngle);
  const ndotl = nx * lx + ny * ly;
  const terminator = smoothstep(-0.2, 0.28, ndotl);
  const lambert = Math.max(0, ndotl);
  const day = 0.4 + 0.6 * lambert;
  const night = 0.09;
  const limbDark = 0.9 + 0.1 * Math.max(0, Math.min(1, nz));
  return (night + (day - night) * terminator) * limbDark;
}

function applyEmissive(rgb: Rgb): Rgb {
  return {
    r: clampByte(Math.min(255, rgb.r * 1.08 + 12)),
    g: clampByte(Math.min(255, rgb.g * 1.05 + 8)),
    b: clampByte(Math.min(255, rgb.b * 1.02)),
  };
}

/** Sun-direction lighting on an orthographic sphere normal (exported for tests). */
export function applySunLighting(
  rgb: Rgb,
  nx: number,
  ny: number,
  lightAngle: number,
  emissive: boolean,
  nz = 1,
): Rgb {
  if (emissive) return applyEmissive(rgb);

  const shade = sunShade(nx, ny, nz, lightAngle);
  return {
    r: clampByte(rgb.r * shade),
    g: clampByte(rgb.g * shade),
    b: clampByte(rgb.b * shade),
  };
}

/**
 * Unlit textured disc, equatorial orthographic with north up (full map, not
 * pole-on). Stars get their emissive tint here. It does not depend on the
 * light direction, so it must never be rotated toward the Sun.
 */
export function generateSurfaceDiscPixels(
  texture: LoadedTexture,
  emissive: boolean,
  size = DISC_CACHE_SIZE,
): Uint8ClampedArray {
  const data = new Uint8ClampedArray(size * size * 4);
  const radius = size / 2;
  const radiusSq = radius * radius;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - radius + 0.5;
      const dy = y - radius + 0.5;
      const distSq = dx * dx + dy * dy;
      const idx = (y * size + x) * 4;

      if (distSq > radiusSq) {
        data[idx + 3] = 0;
        continue;
      }

      const nx = dx / radius;
      const ny = -dy / radius;
      const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));

      const lon = Math.atan2(nx, Math.max(nz, 1e-6));
      const lat = Math.asin(Math.max(-1, Math.min(1, ny)));

      const texU = lon / (Math.PI * 2) + 0.5;
      const texV = 0.5 - lat / Math.PI;
      const base = sampleBilinear(texture.pixels, texture.width, texture.height, texU, texV);
      const rgb = emissive ? applyEmissive(base) : base;

      data[idx] = clampByte(rgb.r);
      data[idx + 1] = clampByte(rgb.g);
      data[idx + 2] = clampByte(rgb.b);
      data[idx + 3] = 255;
    }
  }

  return data;
}

/**
 * Grey shade mask lit from +x (light angle 0), meant to be rotated by the
 * light angle and multiplied over the surface disc. The sphere has radius
 * `size / 2 - margin`; the margin ring repeats the limb shade so the rotated,
 * resampled mask still covers the disc edge (exported for tests).
 */
export function generateShadeMaskPixels(size = DISC_CACHE_SIZE, margin = 0): Uint8ClampedArray {
  const data = new Uint8ClampedArray(size * size * 4);
  const outer = size / 2;
  const radius = outer - margin;
  const outerSq = outer * outer;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - outer + 0.5;
      const dy = y - outer + 0.5;
      const distSq = dx * dx + dy * dy;
      const idx = (y * size + x) * 4;

      if (distSq > outerSq) {
        data[idx + 3] = 0;
        continue;
      }

      const scale = Math.max(1, Math.sqrt(distSq) / radius);
      const nx = dx / radius / scale;
      const ny = -dy / radius / scale;
      const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
      const grey = clampByte(sunShade(nx, ny, nz, 0) * 255);

      data[idx] = grey;
      data[idx + 1] = grey;
      data[idx + 2] = grey;
      data[idx + 3] = 255;
    }
  }

  return data;
}

/** Reference lit disc (surface × shade) in one pass; used by headless tests. */
export function generatePhotoDiscPixels(
  texture: LoadedTexture,
  lightAngle: number,
  emissive: boolean,
  size = DISC_CACHE_SIZE,
): Uint8ClampedArray {
  const data = generateSurfaceDiscPixels(texture, emissive, size);
  if (emissive) return data;

  const radius = size / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;
      if (data[idx + 3] === 0) continue;
      const nx = (x - radius + 0.5) / radius;
      const ny = -(y - radius + 0.5) / radius;
      const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
      const shade = sunShade(nx, ny, nz, lightAngle);
      data[idx] = clampByte(data[idx]! * shade);
      data[idx + 1] = clampByte(data[idx + 1]! * shade);
      data[idx + 2] = clampByte(data[idx + 2]! * shade);
    }
  }
  return data;
}

const SHADE_MASK_MARGIN_PX = 4;
let shadeMaskCanvas: HTMLCanvasElement | null = null;

function pixelsToCanvas(pixels: Uint8ClampedArray, size: number): HTMLCanvasElement | null {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.putImageData(new ImageData(pixels, size, size), 0, 0);
  return canvas;
}

function discCacheKey(path: string, emissive: boolean): string {
  return `${path}|${emissive ? 1 : 0}`;
}

/**
 * One cached unlit disc per texture (north up). Lighting is a separate shade
 * mask rotated toward the Sun at draw time, so the planet's poles never turn
 * with the light while the cache stays at one canvas per texture.
 */
function getSurfaceDiscCanvas(
  texture: LoadedTexture,
  emissive: boolean,
): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null;

  const key = discCacheKey(texture.path, emissive);
  const cached = discCache.get(key);
  if (cached) return cached;

  const canvas = pixelsToCanvas(generateSurfaceDiscPixels(texture, emissive), DISC_CACHE_SIZE);
  if (!canvas) return null;
  discCache.set(key, canvas);
  return canvas;
}

function getShadeMaskCanvas(): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null;
  if (!shadeMaskCanvas) {
    shadeMaskCanvas = pixelsToCanvas(
      generateShadeMaskPixels(DISC_CACHE_SIZE, SHADE_MASK_MARGIN_PX),
      DISC_CACHE_SIZE,
    );
  }
  return shadeMaskCanvas;
}

async function loadTextureSource(path: string): Promise<LoadedTexture | null> {
  if (textureSources.has(path)) return textureSources.get(path)!;
  const pending = loadPromises.get(path);
  if (pending) return pending;

  const promise = new Promise<LoadedTexture | null>((resolve) => {
    if (typeof document === 'undefined') {
      resolve(null);
      return;
    }

    const img = new Image();
    img.onload = () => {
      // A 256 px disc shows at most ~512 px of longitude; keeping 2048×1024
      // RGBA maps in memory cost 8 MB each for no visible detail.
      const scale = Math.min(1, MAX_SOURCE_TEXTURE_WIDTH / img.naturalWidth);
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(null);
        return;
      }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const loaded: LoadedTexture = {
        path,
        width: canvas.width,
        height: canvas.height,
        pixels: imageData.data,
      };
      textureSources.set(path, loaded);
      resolve(loaded);
    };
    img.onerror = () => resolve(null);
    img.src = path;
  });

  loadPromises.set(path, promise);
  return promise;
}

/** Preload all planet photo maps (call once at app start). */
export function preloadPlanetTextures(): void {
  if (typeof document === 'undefined') return;
  const paths = new Set(Object.values(TEXTURE_PATHS));
  paths.add('/textures/planets/jupiter.jpg');
  paths.add('/textures/planets/saturn.jpg');
  paths.add('/textures/planets/neptune.jpg');
  for (const path of paths) {
    void loadTextureSource(path);
  }
}

export function shouldUsePhotoTexture(radiusPx: number): boolean {
  return radiusPx >= MIN_TEXTURE_RADIUS_PX;
}

function drawFallbackDisc(
  ctx: CanvasRenderingContext2D,
  color: string,
  x: number,
  y: number,
  radiusPx: number,
  lightAngle: number,
  emissive: boolean,
): void {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, radiusPx, 0, Math.PI * 2);
  ctx.fill();

  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, radiusPx, 0, Math.PI * 2);
  ctx.clip();

  if (emissive) {
    const g = ctx.createRadialGradient(x, y, radiusPx * 0.1, x, y, radiusPx);
    g.addColorStop(0, 'rgba(255,255,255,0.25)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
  } else {
    // lightAngle is a world angle (y up); canvas y points down.
    const lx = Math.cos(lightAngle);
    const ly = -Math.sin(lightAngle);
    const g = ctx.createLinearGradient(
      x - lx * radiusPx,
      y - ly * radiusPx,
      x + lx * radiusPx,
      y + ly * radiusPx,
    );
    g.addColorStop(0, 'rgba(0,0,0,0.45)');
    g.addColorStop(0.45, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(255,255,255,0.25)');
    ctx.fillStyle = g;
  }

  ctx.fillRect(x - radiusPx, y - radiusPx, radiusPx * 2, radiusPx * 2);
  ctx.restore();
}

export function drawTexturedBodyDisc(
  ctx: CanvasRenderingContext2D,
  body: SnapshotBody,
  x: number,
  y: number,
  radiusPx: number,
  options: DrawBodySurfaceOptions = {},
): void {
  const kind = resolveBodyTextureKind(body);
  const emissive = kind === 'star';
  const lightAngle = lightAngleFromSun(body, options.sunWorldPosition);
  const path = texturePathForBody(body);
  const texture = textureSources.get(path);

  if (!shouldUsePhotoTexture(radiusPx)) {
    drawFallbackDisc(ctx, body.visual.color, x, y, radiusPx, lightAngle, emissive);
    if (!texture) void loadTextureSource(path);
    return;
  }

  if (texture) {
    const disc = getSurfaceDiscCanvas(texture, emissive);
    if (disc) {
      ctx.save();
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(disc, x - radiusPx, y - radiusPx, radiusPx * 2, radiusPx * 2);

      const mask = emissive ? null : getShadeMaskCanvas();
      if (mask) {
        // Multiply only inside the disc so the mask margin never darkens the sky.
        ctx.beginPath();
        ctx.arc(x, y, radiusPx, 0, Math.PI * 2);
        ctx.clip();
        ctx.globalCompositeOperation = 'multiply';
        // Canvas y points down: a counter-clockwise world angle is a negative rotate().
        ctx.translate(x, y);
        ctx.rotate(-lightAngle);
        const half = (radiusPx * (DISC_CACHE_SIZE / 2)) / (DISC_CACHE_SIZE / 2 - SHADE_MASK_MARGIN_PX);
        ctx.drawImage(mask, -half, -half, half * 2, half * 2);
      }
      ctx.restore();
      return;
    }
  }

  drawFallbackDisc(ctx, body.visual.color, x, y, radiusPx, lightAngle, emissive);
  if (!texture) void loadTextureSource(path);
}

/** Clear cached disc canvases and loaded pixels (tests / hot reload). */
export function clearBodyTextureCache(): void {
  discCache.clear();
  shadeMaskCanvas = null;
  textureSources.clear();
  loadPromises.clear();
}

/** Sample variance across a photo disc (headless tests with synthetic texture). */
export function texturePixelVariance(pixels: Uint8ClampedArray): number {
  let sum = 0;
  let sumSq = 0;
  let count = 0;
  for (let i = 0; i < pixels.length; i += 4) {
    if (pixels[i + 3] === 0) continue;
    const lum = pixels[i]! * 0.299 + pixels[i + 1]! * 0.587 + pixels[i + 2]! * 0.114;
    sum += lum;
    sumSq += lum * lum;
    count++;
  }
  if (count === 0) return 0;
  const mean = sum / count;
  return sumSq / count - mean * mean;
}
