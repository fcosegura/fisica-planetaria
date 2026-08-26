import type { BodyTextureKind, SnapshotBody, Vec2 } from '@/sim/types';

export type { BodyTextureKind };

const DISC_CACHE_SIZE = 256;
const MIN_TEXTURE_RADIUS_PX = 3;
const ANGLE_BUCKET = Math.PI / 36; // 5°

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

/** Sun-direction lighting on an orthographic sphere normal (exported for tests). */
export function applySunLighting(rgb: Rgb, nx: number, ny: number, lightAngle: number, emissive: boolean): Rgb {
  if (emissive) {
    return {
      r: clampByte(Math.min(255, rgb.r * 1.08 + 12)),
      g: clampByte(Math.min(255, rgb.g * 1.05 + 8)),
      b: clampByte(Math.min(255, rgb.b * 1.02)),
    };
  }

  const lx = Math.cos(lightAngle);
  const ly = Math.sin(lightAngle);
  const dot = Math.max(0, nx * lx + ny * ly);
  const shade = 0.22 + 0.78 * dot;
  return {
    r: clampByte(rgb.r * shade),
    g: clampByte(rgb.g * shade),
    b: clampByte(rgb.b * shade),
  };
}

export function generatePhotoDiscPixels(
  texture: LoadedTexture,
  lightAngle: number,
  emissive: boolean,
  size = DISC_CACHE_SIZE,
): Uint8ClampedArray {
  const data = new Uint8ClampedArray(size * size * 4);
  const radius = size / 2;
  const radiusSq = radius * radius;
  const cosA = Math.cos(-lightAngle);
  const sinA = Math.sin(-lightAngle);

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

      const u = dx / radius;
      const v = -dy / radius;
      const nz = Math.sqrt(Math.max(0, 1 - u * u - v * v));
      const nx = u;
      const ny = v;

      const rx = nx * cosA - ny * sinA;
      const ry = nx * sinA + ny * cosA;
      const lon = Math.atan2(ry, rx);
      const lat = Math.asin(Math.max(-1, Math.min(1, nz)));

      const texU = lon / (Math.PI * 2) + 0.5;
      const texV = 0.5 - lat / Math.PI;
      const base = sampleBilinear(texture.pixels, texture.width, texture.height, texU, texV);
      const lit = applySunLighting(base, nx, ny, lightAngle, emissive);

      data[idx] = lit.r;
      data[idx + 1] = lit.g;
      data[idx + 2] = lit.b;
      data[idx + 3] = 255;
    }
  }

  return data;
}

function discCacheKey(path: string, lightAngle: number, emissive: boolean): string {
  const bucket = Math.round(lightAngle / ANGLE_BUCKET);
  return `${path}|${bucket}|${emissive ? 1 : 0}`;
}

function getPhotoDiscCanvas(
  texture: LoadedTexture,
  lightAngle: number,
  emissive: boolean,
): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null;

  const key = discCacheKey(texture.path, lightAngle, emissive);
  const cached = discCache.get(key);
  if (cached) return cached;

  const canvas = document.createElement('canvas');
  canvas.width = DISC_CACHE_SIZE;
  canvas.height = DISC_CACHE_SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const pixels = generatePhotoDiscPixels(texture, lightAngle, emissive);
  ctx.putImageData(new ImageData(pixels, DISC_CACHE_SIZE, DISC_CACHE_SIZE), 0, 0);
  discCache.set(key, canvas);
  return canvas;
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
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(null);
        return;
      }
      ctx.drawImage(img, 0, 0);
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
    const lx = Math.cos(lightAngle);
    const ly = Math.sin(lightAngle);
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

  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, radiusPx, 0, Math.PI * 2);
  ctx.clip();

  if (texture) {
    const disc = getPhotoDiscCanvas(texture, lightAngle, emissive);
    if (disc) {
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(disc, x - radiusPx, y - radiusPx, radiusPx * 2, radiusPx * 2);
      ctx.restore();
      return;
    }
  }

  drawFallbackDisc(ctx, body.visual.color, x, y, radiusPx, lightAngle, emissive);
  ctx.restore();
  if (!texture) void loadTextureSource(path);
}

/** Clear cached disc canvases and loaded pixels (tests / hot reload). */
export function clearBodyTextureCache(): void {
  discCache.clear();
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
