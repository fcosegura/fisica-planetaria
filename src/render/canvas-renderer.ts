import type { SimSnapshot, SnapshotBody } from '@/sim/types';
import { Camera2D } from './camera2d';
import { TrailBuffer } from './trails';

export type BodyScaleMode = 'relative' | 'real';

export interface RenderOptions {
  showDebug?: boolean;
  selectedId?: string | null;
  followId?: string | null;
  bodyScaleMode?: BodyScaleMode;
}

/**
 * Real-mode drawn radius is `physicalRadius * zoom` (px). Do not inflate:
 * a ×25 disk swallows the Galilean moons (Europa ≈ 9.6 R♃, Ganymede ≈ 15 R♃).
 */
export const REAL_SCALE_MULTIPLIER = 1;

export class CanvasRenderer {
  private ctx: CanvasRenderingContext2D;
  camera: Camera2D;
  trails = new TrailBuffer(300);

  constructor(
    private canvas: HTMLCanvasElement,
    camera?: Camera2D,
  ) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D not supported');
    this.ctx = ctx;
    this.camera = camera ?? new Camera2D();
    this.resize();
  }

  resize(): void {
    const dpr = typeof window !== 'undefined' ? (window.devicePixelRatio || 1) : 1;
    const rect = this.canvas.getBoundingClientRect();
    this.canvas.width = rect.width * dpr;
    this.canvas.height = rect.height * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.camera.setSize(rect.width, rect.height);
  }

  computeBodyRadius(body: SnapshotBody, mode: BodyScaleMode = 'relative'): number {
    if (mode === 'real') {
      const px = body.radius * this.camera.zoom * REAL_SCALE_MULTIPLIER;
      return Math.max(0.5, px);
    }
    return body.visual.displayRadius;
  }

  render(snapshot: SimSnapshot, options: RenderOptions = {}): void {
    const { width, height } = this.camera;
    const ctx = this.ctx;
    const bodyScaleMode = options.bodyScaleMode ?? 'relative';

    if (options.followId) {
      const body = snapshot.bodies.find((b) => b.id === options.followId);
      if (body) this.camera.follow(body.position);
    }

    ctx.fillStyle = '#0b0f19';
    ctx.fillRect(0, 0, width, height);

    this.drawGrid();

    // Clean up trails for bodies no longer present (e.g. after collision merge or deletion)
    const activeIds = new Set(snapshot.bodies.map((b) => b.id));
    this.trails.retainOnly(activeIds);

    for (const body of snapshot.bodies) {
      if (body.visual.showTrail) {
        this.trails.push(body.id, body.position, body.visual.trailLength);
        this.drawTrail(body);
      }
    }

    for (const body of snapshot.bodies) {
      this.drawBody(body, body.id === options.selectedId, bodyScaleMode);
    }

    if (options.showDebug) {
      for (const body of snapshot.bodies) {
        this.drawDebugVectors(body);
      }
    }
  }

  clearTrails(): void {
    this.trails.clear();
  }

  hitTest(snapshot: SimSnapshot, sx: number, sy: number, mode: BodyScaleMode = 'relative'): string | null {
    for (let i = snapshot.bodies.length - 1; i >= 0; i--) {
      const body = snapshot.bodies[i]!;
      const screen = this.camera.worldToScreen(body.position.x, body.position.y);
      const r = this.computeBodyRadius(body, mode);
      const effectiveRadius = Math.max(8, r) + 4;
      const dx = sx - screen.x;
      const dy = sy - screen.y;
      if (dx * dx + dy * dy <= effectiveRadius * effectiveRadius) return body.id;
    }
    return null;
  }

  private drawGrid(): void {
    const ctx = this.ctx;
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 1;

    const topLeft = this.camera.screenToWorld(0, 0);
    const bottomRight = this.camera.screenToWorld(this.camera.width, this.camera.height);

    const worldSpan = Math.max(Math.abs(bottomRight.x - topLeft.x), Math.abs(topLeft.y - bottomRight.y));
    const step = Math.pow(10, Math.floor(Math.log10(worldSpan / 8)));

    const startX = Math.floor(topLeft.x / step) * step;
    const startY = Math.floor(bottomRight.y / step) * step;

    for (let x = startX; x <= bottomRight.x; x += step) {
      const s = this.camera.worldToScreen(x, 0);
      ctx.beginPath();
      ctx.moveTo(s.x, 0);
      ctx.lineTo(s.x, this.camera.height);
      ctx.stroke();
    }

    for (let y = startY; y <= topLeft.y; y += step) {
      const s = this.camera.worldToScreen(0, y);
      ctx.beginPath();
      ctx.moveTo(0, s.y);
      ctx.lineTo(this.camera.width, s.y);
      ctx.stroke();
    }
  }

  private drawTrail(body: SnapshotBody): void {
    if (this.trails.getLength(body.id) < 2) return;

    const ctx = this.ctx;
    ctx.strokeStyle = body.visual.color + '66';
    ctx.lineWidth = 1.5;
    ctx.beginPath();

    this.trails.forEach(body.id, (wx, wy, i) => {
      const s = this.camera.worldToScreen(wx, wy);
      if (i === 0) ctx.moveTo(s.x, s.y);
      else ctx.lineTo(s.x, s.y);
    });

    ctx.stroke();
  }

  private drawBody(body: SnapshotBody, selected: boolean, mode: BodyScaleMode = 'relative'): void {
    const ctx = this.ctx;
    const s = this.camera.worldToScreen(body.position.x, body.position.y);
    const r = this.computeBodyRadius(body, mode);
    const isStar = body.mass >= 1e29 || body.name.toLowerCase().includes('sol') || body.name.toLowerCase().includes('sun');

    // Glow / Corona for stars
    if (isStar) {
      const glowRadius = Math.max(r * 1.5, r + 12);
      const gradient = ctx.createRadialGradient(s.x, s.y, Math.max(1, r * 0.3), s.x, s.y, glowRadius);
      gradient.addColorStop(0, 'rgba(251, 191, 36, 0.45)');
      gradient.addColorStop(0.5, 'rgba(245, 158, 11, 0.18)');
      gradient.addColorStop(1, 'rgba(245, 158, 11, 0)');
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(s.x, s.y, glowRadius, 0, Math.PI * 2);
      ctx.fill();
    }

    if (selected) {
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(s.x, s.y, Math.max(r, 4) + 4, 0, Math.PI * 2);
      ctx.stroke();
    }

    // In real mode, if the body's actual disk is very small (subpixel or small dot),
    // render a clear visible celestial beacon so planets don't disappear on screen
    if (mode === 'real' && r < 3 && !isStar) {
      // Subtle glow halo
      ctx.fillStyle = body.visual.color + '44';
      ctx.beginPath();
      ctx.arc(s.x, s.y, 5, 0, Math.PI * 2);
      ctx.fill();

      // Sharp visible core dot
      ctx.fillStyle = body.visual.color;
      ctx.beginPath();
      ctx.arc(s.x, s.y, 2.5, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillStyle = body.visual.color;
      ctx.beginPath();
      ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.font = '11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    const labelOffset = Math.max(r, isStar ? 12 : 5) + 6;
    ctx.fillText(body.name, s.x, s.y - labelOffset);
  }

  private drawDebugVectors(body: SnapshotBody): void {
    const origin = this.camera.worldToScreen(body.position.x, body.position.y);
    const speed = Math.hypot(body.velocity.x, body.velocity.y);
    if (speed <= 0) return;

    // Scale so that typical orbital speed (~30 km/s) gives ~35px arrow, clamped between 12px and 70px
    const refSpeed = 30_000;
    const arrowLength = Math.min(70, Math.max(12, (speed / refSpeed) * 35));
    const dirX = body.velocity.x / speed;
    const dirY = body.velocity.y / speed;

    this.drawArrow(
      origin.x,
      origin.y,
      dirX * arrowLength,
      -dirY * arrowLength,
      '#22c55e',
    );
  }

  private drawArrow(x: number, y: number, dx: number, dy: number, color: string): void {
    const ctx = this.ctx;
    const len = Math.hypot(dx, dy);
    if (len < 2) return;

    const headLength = Math.min(7, len * 0.3);
    const angle = Math.atan2(dy, dx);

    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 1.5;

    // Shaft
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + dx, y + dy);
    ctx.stroke();

    // Arrowhead
    ctx.beginPath();
    ctx.moveTo(x + dx, y + dy);
    ctx.lineTo(
      x + dx - headLength * Math.cos(angle - Math.PI / 6),
      y + dy - headLength * Math.sin(angle - Math.PI / 6),
    );
    ctx.lineTo(
      x + dx - headLength * Math.cos(angle + Math.PI / 6),
      y + dy - headLength * Math.sin(angle + Math.PI / 6),
    );
    ctx.closePath();
    ctx.fill();
  }
}
