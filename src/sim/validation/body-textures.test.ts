import { describe, expect, it } from 'vitest';
import {
  PLANETS_CATALOG,
  SOLAR_SYSTEM_CATALOG,
  SUN_TEMPLATE,
  textureKindForTemplate,
} from '../catalog/solar-system';
import type { SnapshotBody } from '../types';
import {
  applySunLighting,
  generatePhotoDiscPixels,
  lightAngleFromSun,
  resolveBodyTextureKind,
  seedFromId,
  texturePathForBody,
  texturePixelVariance,
} from '@/render/body-textures';

describe('textureKindForTemplate', () => {
  it('maps major planets to expected surface kinds', () => {
    expect(textureKindForTemplate(SUN_TEMPLATE)).toBe('star');
    expect(textureKindForTemplate(PLANETS_CATALOG.find((p) => p.id === 'earth')!)).toBe('earth');
    expect(textureKindForTemplate(PLANETS_CATALOG.find((p) => p.id === 'venus')!)).toBe('venus');
    expect(textureKindForTemplate(PLANETS_CATALOG.find((p) => p.id === 'mars')!)).toBe('mars');
    expect(textureKindForTemplate(PLANETS_CATALOG.find((p) => p.id === 'jupiter')!)).toBe('gasBand');
    expect(textureKindForTemplate(PLANETS_CATALOG.find((p) => p.id === 'saturn')!)).toBe('gasBand');
    expect(textureKindForTemplate(PLANETS_CATALOG.find((p) => p.id === 'uranus')!)).toBe('iceGiant');
    expect(textureKindForTemplate(PLANETS_CATALOG.find((p) => p.id === 'neptune')!)).toBe('iceGiant');
    expect(textureKindForTemplate(PLANETS_CATALOG.find((p) => p.id === 'mercury')!)).toBe('rocky');
  });

  it('maps catalog categories to icy or rocky fallbacks', () => {
    const ceres = SOLAR_SYSTEM_CATALOG.find((p) => p.id === 'ceres')!;
    const vesta = SOLAR_SYSTEM_CATALOG.find((p) => p.id === 'vesta')!;
    const sedna = SOLAR_SYSTEM_CATALOG.find((p) => p.id === 'sedna')!;
    const moon = SOLAR_SYSTEM_CATALOG.find((p) => p.id === 'moon')!;
    const europa = SOLAR_SYSTEM_CATALOG.find((p) => p.id === 'europa_moon')!;

    expect(textureKindForTemplate(ceres)).toBe('icy');
    expect(textureKindForTemplate(vesta)).toBe('rocky');
    expect(textureKindForTemplate(sedna)).toBe('icy');
    expect(textureKindForTemplate(moon)).toBe('rocky');
    expect(textureKindForTemplate(europa)).toBe('icy');
  });
});

describe('texturePathForBody', () => {
  const base: SnapshotBody = {
    id: 'jupiter-1',
    name: 'Júpiter',
    mass: 1.898e27,
    radius: 6.991e7,
    position: { x: 0, y: 0 },
    velocity: { x: 0, y: 0 },
    state: 'dynamic',
    visual: {
      color: '#f59e0b',
      displayRadius: 16,
      showTrail: true,
      trailLength: 400,
      textureKind: 'gasBand',
    },
  };

  it('selects planet-specific photo maps', () => {
    expect(texturePathForBody(base)).toBe('/textures/planets/jupiter.jpg');
    expect(texturePathForBody({ ...base, name: 'Saturno' })).toBe('/textures/planets/saturn.jpg');
    expect(texturePathForBody({ ...base, name: 'Tierra', visual: { ...base.visual, textureKind: 'earth' } }))
      .toBe('/textures/planets/earth.jpg');
    expect(texturePathForBody({ ...base, name: 'Neptuno', visual: { ...base.visual, textureKind: 'iceGiant' } }))
      .toBe('/textures/planets/neptune.jpg');
  });
});

describe('resolveBodyTextureKind', () => {
  const base: SnapshotBody = {
    id: 'custom-1',
    name: 'Nuevo cuerpo',
    mass: 1e24,
    radius: 6e6,
    position: { x: 0, y: 0 },
    velocity: { x: 0, y: 0 },
    state: 'dynamic',
    visual: {
      color: '#10b981',
      displayRadius: 8,
      showTrail: true,
      trailLength: 100,
    },
  };

  it('prefers explicit visual.textureKind', () => {
    expect(
      resolveBodyTextureKind({
        ...base,
        visual: { ...base.visual, textureKind: 'venus' },
      }),
    ).toBe('venus');
  });

  it('infers star, earth and gas giants from name', () => {
    expect(resolveBodyTextureKind({ ...base, name: 'Sol', mass: 2e30 })).toBe('star');
    expect(resolveBodyTextureKind({ ...base, name: 'Tierra' })).toBe('earth');
    expect(resolveBodyTextureKind({ ...base, name: 'Júpiter' })).toBe('gasBand');
  });

  it('derives stable seeds from body id', () => {
    expect(seedFromId('earth-1')).toBe(seedFromId('earth-1'));
    expect(seedFromId('earth-1')).not.toBe(seedFromId('earth-2'));
  });
});

describe('sun-centered photo disc', () => {
  it('computes light angle from body toward the Sun', () => {
    const body: SnapshotBody = {
      id: 'earth-1',
      name: 'Tierra',
      mass: 1,
      radius: 1,
      position: { x: 1, y: 0 },
      velocity: { x: 0, y: 0 },
      state: 'dynamic',
      visual: { color: '#fff', displayRadius: 8, showTrail: false, trailLength: 0 },
    };
    expect(lightAngleFromSun(body, { x: 0, y: 0 })).toBeCloseTo(Math.PI, 5);
  });

  it('darkens the far side relative to the lit side', () => {
    const lit = applySunLighting({ r: 200, g: 200, b: 200 }, 1, 0, 0, false);
    const dark = applySunLighting({ r: 200, g: 200, b: 200 }, -1, 0, 0, false);
    expect(lit.r).toBeGreaterThan(dark.r);
    expect(lit.g).toBeGreaterThan(dark.g);
  });

  it('keeps stars emissive without a dark hemisphere', () => {
    const lit = applySunLighting({ r: 200, g: 160, b: 80 }, 1, 0, 0, true);
    const dark = applySunLighting({ r: 200, g: 160, b: 80 }, -1, 0, 0, true);
    expect(lit.r).toBeGreaterThan(200);
    expect(dark.r).toBeGreaterThan(200);
  });

  it('produces shaded variation on a synthetic equirectangular map', () => {
    const width = 64;
    const height = 32;
    const pixels = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;
        pixels[idx] = x % 8 === 0 ? 220 : 120;
        pixels[idx + 1] = 100;
        pixels[idx + 2] = 60;
        pixels[idx + 3] = 255;
      }
    }

    const disc = generatePhotoDiscPixels(
      { path: 'test', width, height, pixels },
      0,
      false,
      64,
    );
    expect(texturePixelVariance(disc)).toBeGreaterThan(100);
  });
});
