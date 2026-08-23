import { describe, expect, it } from 'vitest';
import { TrailBuffer } from '../../render/trails';

describe('TrailBuffer ring buffer', () => {
  it('stores and retrieves points in chronological order', () => {
    const trails = new TrailBuffer(3);
    trails.push('body-1', { x: 10, y: 20 });
    trails.push('body-1', { x: 30, y: 40 });

    const pts = trails.get('body-1');
    expect(pts).toEqual([
      { x: 10, y: 20 },
      { x: 30, y: 40 },
    ]);
    expect(trails.getLength('body-1')).toBe(2);
  });

  it('overwrites oldest points when capacity is exceeded without shifting arrays', () => {
    const trails = new TrailBuffer(3);
    trails.push('body-1', { x: 1, y: 1 });
    trails.push('body-1', { x: 2, y: 2 });
    trails.push('body-1', { x: 3, y: 3 });
    // Buffer full [1, 2, 3]
    trails.push('body-1', { x: 4, y: 4 });
    // Should drop 1, keeping [2, 3, 4] in chronological order
    expect(trails.get('body-1')).toEqual([
      { x: 2, y: 2 },
      { x: 3, y: 3 },
      { x: 4, y: 4 },
    ]);

    trails.push('body-1', { x: 5, y: 5 });
    expect(trails.get('body-1')).toEqual([
      { x: 3, y: 3 },
      { x: 4, y: 4 },
      { x: 5, y: 5 },
    ]);
  });

  it('supports per-body maxPoints capacity', () => {
    const trails = new TrailBuffer(100);
    // Body A with maxPoints = 2
    trails.push('body-a', { x: 1, y: 1 }, 2);
    trails.push('body-a', { x: 2, y: 2 }, 2);
    trails.push('body-a', { x: 3, y: 3 }, 2);

    // Body B with maxPoints = 4
    trails.push('body-b', { x: 10, y: 10 }, 4);
    trails.push('body-b', { x: 20, y: 20 }, 4);
    trails.push('body-b', { x: 30, y: 30 }, 4);

    expect(trails.get('body-a')).toEqual([
      { x: 2, y: 2 },
      { x: 3, y: 3 },
    ]);

    expect(trails.get('body-b')).toEqual([
      { x: 10, y: 10 },
      { x: 20, y: 20 },
      { x: 30, y: 30 },
    ]);
  });

  it('iterates with forEach without object allocations', () => {
    const trails = new TrailBuffer(3);
    trails.push('b1', { x: 10, y: 10 });
    trails.push('b1', { x: 20, y: 20 });
    trails.push('b1', { x: 30, y: 30 });
    trails.push('b1', { x: 40, y: 40 });

    const collected: { x: number; y: number; i: number }[] = [];
    trails.forEach('b1', (x, y, i) => {
      collected.push({ x, y, i });
    });

    expect(collected).toEqual([
      { x: 20, y: 20, i: 0 },
      { x: 30, y: 30, i: 1 },
      { x: 40, y: 40, i: 2 },
    ]);
  });

  it('cleans up orphaned trails with retainOnly', () => {
    const trails = new TrailBuffer(10);
    trails.push('b1', { x: 1, y: 1 });
    trails.push('b2', { x: 2, y: 2 });
    trails.push('b3', { x: 3, y: 3 });

    expect(trails.getLength('b1')).toBe(1);
    expect(trails.getLength('b2')).toBe(1);
    expect(trails.getLength('b3')).toBe(1);

    // After collision/deletion, only b1 remains active
    trails.retainOnly(new Set(['b1']));

    expect(trails.getLength('b1')).toBe(1);
    expect(trails.getLength('b2')).toBe(0);
    expect(trails.getLength('b3')).toBe(0);
  });
});
