import type { Vec2 } from '@/sim/types';

export class Camera2D {
  center: Vec2 = { x: 0, y: 0 };
  /** pixels per meter (log scale applied externally) */
  zoom = 1e-9;
  width = 800;
  height = 600;

  setSize(width: number, height: number): void {
    this.width = width;
    this.height = height;
  }

  screenToWorld(sx: number, sy: number): Vec2 {
    return {
      x: this.center.x + (sx - this.width / 2) / this.zoom,
      y: this.center.y - (sy - this.height / 2) / this.zoom,
    };
  }

  worldToScreen(wx: number, wy: number): Vec2 {
    return {
      x: (wx - this.center.x) * this.zoom + this.width / 2,
      y: -(wy - this.center.y) * this.zoom + this.height / 2,
    };
  }

  pan(dxScreen: number, dyScreen: number): void {
    this.center.x -= dxScreen / this.zoom;
    this.center.y += dyScreen / this.zoom;
  }

  zoomAt(factor: number, sx: number, sy: number): void {
    const before = this.screenToWorld(sx, sy);
    this.zoom = Math.max(1e-15, Math.min(1e-3, this.zoom * factor));
    const after = this.screenToWorld(sx, sy);
    this.center.x += before.x - after.x;
    this.center.y += before.y - after.y;
  }

  fitBodies(positions: Vec2[], padding = 80): void {
    if (positions.length === 0) return;

    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;

    for (const p of positions) {
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y);
      maxY = Math.max(maxY, p.y);
    }

    const spanX = Math.max(maxX - minX, 1);
    const spanY = Math.max(maxY - minY, 1);
    const zoomX = (this.width - padding * 2) / spanX;
    const zoomY = (this.height - padding * 2) / spanY;

    this.zoom = Math.max(1e-15, Math.min(zoomX, zoomY));
    this.center = { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
  }

  follow(target: Vec2): void {
    this.center = { x: target.x, y: target.y };
  }
}
