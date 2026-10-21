import { describe, expect, it } from 'vitest';
import type { SnapshotBody } from '../types';
import {
  atmosphereIntensity,
  computeSolarCorona,
  computeSolarWaves,
  effectiveBodyHitRadius,
  generateStarfieldPoints,
  limbFactor,
  resolveAtmosphereProfile,
  resolveRingProfile,
  ringDensity,
  shouldDrawEffects,
  solarFactor,
  starfieldHash,
} from '@/render/body-effects';
import { VisualClock } from '@/render/visual-clock';

function mockBody(overrides: Partial<SnapshotBody> & Pick<SnapshotBody, 'name'>): SnapshotBody {
  return {
    id: 'test-1',
    mass: 1e24,
    radius: 6e6,
    position: { x: 0, y: 0 },
    velocity: { x: 0, y: 0 },
    state: 'dynamic',
    visual: {
      color: '#3b82f6',
      displayRadius: 8,
      showTrail: false,
      trailLength: 0,
    },
    ...overrides,
  };
}

describe('resolveRingProfile', () => {
  it('returns Saturn rings with Cassini gap and main regions', () => {
    const profile = resolveRingProfile(mockBody({ name: 'Saturno' }), 20);
    expect(profile).not.toBeNull();
    expect(profile!.maxOuterRatio).toBeCloseTo(2.32);
    expect(profile!.tilt).toBeCloseTo(1);
    expect(profile!.bands.length).toBeGreaterThanOrEqual(4);
    expect(profile!.gaps.some((g) => g.innerRatio === 1.95 && g.outerRatio === 2.023)).toBe(true);
    expect(ringDensity(1.7, profile!)).toBeGreaterThan(ringDensity(1.98, profile!));
    expect(ringDensity(1.98, profile!)).toBeLessThan(0.12);
  });

  it('is deterministic for Saturn ringlets', () => {
    const profile = resolveRingProfile(mockBody({ name: 'Saturno' }), 20)!;
    expect(ringDensity(1.7, profile)).toBe(ringDensity(1.7, profile));
  });

  it('returns Uranus rings face-on in the orbital plane', () => {
    const profile = resolveRingProfile(mockBody({ name: 'Urano' }), 16);
    expect(profile).not.toBeNull();
    expect(profile!.tilt).toBeCloseTo(1);
    expect(profile!.opacity).toBeLessThan(0.5);
  });

  it('does not add a dust ring around Jupiter', () => {
    const profile = resolveRingProfile(
      mockBody({
        name: 'Júpiter',
        visual: { color: '#f59e0b', displayRadius: 16, showTrail: false, trailLength: 0, textureKind: 'gasBand' },
      }),
      10,
    );
    expect(profile).toBeNull();
  });

  it('skips rings when disc is too small', () => {
    expect(resolveRingProfile(mockBody({ name: 'Saturno' }), 3)).toBeNull();
  });
});

describe('resolveAtmosphereProfile', () => {
  it('returns Earth blue atmosphere', () => {
    const profile = resolveAtmosphereProfile(mockBody({ name: 'Tierra' }), 10);
    expect(profile).not.toBeNull();
    expect(profile!.outerRatio).toBeCloseTo(1.1);
    expect(profile!.color).toBe('#60a5fa');
    expect(profile!.scattering).toBeGreaterThan(0.8);
  });

  it('returns Venus dense atmosphere', () => {
    const profile = resolveAtmosphereProfile(mockBody({ name: 'Venus' }), 10);
    expect(profile!.outerRatio).toBeCloseTo(1.18);
    expect(profile!.thickness).toBeGreaterThan(0.12);
  });

  it('returns Titan orange atmosphere', () => {
    const profile = resolveAtmosphereProfile(mockBody({ name: 'Titán' }), 10);
    expect(profile!.outerRatio).toBeCloseTo(1.16);
    expect(profile!.color).toBe('#fb923c');
  });

  it('returns Mars thin atmosphere', () => {
    const profile = resolveAtmosphereProfile(mockBody({ name: 'Marte' }), 10);
    expect(profile!.outerRatio).toBeCloseTo(1.05);
  });

  it('does not invent an atmosphere for the Moon', () => {
    expect(resolveAtmosphereProfile(mockBody({ name: 'Luna' }), 12)).toBeNull();
  });
});

describe('atmospheric scattering approximation', () => {
  it('peaks at the limb and falls off outside', () => {
    expect(limbFactor(10, 10, 0.1)).toBeGreaterThan(limbFactor(8, 10, 0.1));
    expect(limbFactor(11.2, 10, 0.1)).toBeLessThan(limbFactor(10, 10, 0.1));
  });

  it('is brighter on the sunlit side than the night side', () => {
    const day = solarFactor(1, 0, 0, 0.12);
    const night = solarFactor(-1, 0, 0, 0.12);
    expect(day).toBeGreaterThan(night);
    expect(atmosphereIntensity(1, day, { intensity: 1 })).toBeGreaterThan(
      atmosphereIntensity(1, night, { intensity: 1 }),
    );
  });
});

describe('computeSolarWaves', () => {
  it('is deterministic for the same time', () => {
    const a = computeSolarWaves(5000, 20);
    const b = computeSolarWaves(5000, 20);
    expect(a).toEqual(b);
  });

  it('produces three waves within expected radius range', () => {
    const waves = computeSolarWaves(0, 20);
    expect(waves).toHaveLength(3);
    for (const wave of waves) {
      expect(wave.radius).toBeGreaterThanOrEqual(20 * 1.15);
      expect(wave.radius).toBeLessThanOrEqual(20 * 2.35 + 0.01);
      expect(wave.alpha).toBeGreaterThanOrEqual(0);
      expect(wave.alpha).toBeLessThanOrEqual(0.35);
    }
  });
});

describe('computeSolarCorona', () => {
  it('pulses between frames', () => {
    const a = computeSolarCorona(0, 20);
    const b = computeSolarCorona(500, 20);
    expect(a.outerRadius).not.toBeCloseTo(b.outerRadius, 0);
  });
});

describe('effectiveBodyHitRadius', () => {
  it('extends hit area for Saturn rings', () => {
    const profile = resolveRingProfile(mockBody({ name: 'Saturno' }), 20)!;
    const hitR = effectiveBodyHitRadius(20, profile);
    expect(hitR).toBeGreaterThan(24);
    expect(hitR).toBeCloseTo(20 * 2.32 + 4);
  });

  it('uses disc minimum when no rings', () => {
    expect(effectiveBodyHitRadius(5, null)).toBe(12);
  });
});

describe('shouldDrawEffects', () => {
  it('respects minimum radius threshold', () => {
    expect(shouldDrawEffects(3)).toBe(false);
    expect(shouldDrawEffects(4)).toBe(true);
  });
});

describe('starfieldHash', () => {
  it('is deterministic', () => {
    expect(starfieldHash(3, 7, 1)).toBe(starfieldHash(3, 7, 1));
    expect(starfieldHash(3, 7, 1)).not.toBe(starfieldHash(3, 8, 1));
  });
});

describe('generateStarfieldPoints', () => {
  it('returns points inside the viewport', () => {
    const points = generateStarfieldPoints(800, 600, 0, 0, 1e-9, 1e11);
    expect(points.length).toBeGreaterThan(0);
    for (const p of points) {
      expect(p.sx).toBeGreaterThanOrEqual(-4);
      expect(p.sx).toBeLessThanOrEqual(804);
      expect(p.sy).toBeGreaterThanOrEqual(-4);
      expect(p.sy).toBeLessThanOrEqual(604);
    }
  });
});

describe('VisualClock', () => {
  it('freezes while paused and advances while playing', () => {
    const clock = new VisualClock();
    expect(clock.tick(1000, true, false)).toBe(0);
    expect(clock.tick(1100, true, false)).toBe(100);
    expect(clock.tick(1500, false, false)).toBe(100);
    expect(clock.tick(1800, false, false)).toBe(100);
    expect(clock.tick(1900, true, false)).toBe(100);
    expect(clock.tick(2000, true, false)).toBe(200);
  });

  it('stays at zero when reduced motion is requested', () => {
    const clock = new VisualClock();
    expect(clock.tick(1000, true, true)).toBe(0);
    expect(clock.tick(1400, true, true)).toBe(0);
  });
});
