import * as planck from 'planck';
import { Renderer } from '../rendering/renderer';
import { ForceLink, DEFAULT_FORCE_LINK_PARAMS } from '../physics/forceLinks';

type CanvasPt = { x: number; y: number };

// Hover/selection outline colors
const HOVER_COLOR     = 'rgba(200, 140, 255, 0.5)';
const SELECTED_A_COLOR = 'rgba(200, 140, 255, 0.9)';

// Body hit-test tolerance in pixels
const BODY_HIT_PX = 12;

type PlacementState =
  | { phase: 'select-a' }
  | { phase: 'select-b'; bodyA: planck.Body };

/**
 * Two-phase tool for creating ForceLinks.
 * Phase 1: user clicks body A.
 * Phase 2: user clicks body B → link is committed.
 */
export class ForceLinkTool {
  private world: planck.World;
  private renderer: Renderer;
  private state: PlacementState = { phase: 'select-a' };
  private hoveredBody: planck.Body | null = null;

  private onCommit: (link: ForceLink) => void;
  private statusCallback: ((text: string) => void) | null = null;

  constructor(
    world: planck.World,
    renderer: Renderer,
    onCommit: (link: ForceLink) => void,
  ) {
    this.world = world;
    this.renderer = renderer;
    this.onCommit = onCommit;
  }

  onStatusChange(cb: (text: string) => void): void {
    this.statusCallback = cb;
  }

  activate(): void {
    this.state = { phase: 'select-a' };
    this.hoveredBody = null;
    this.statusCallback?.('Force link — click Body A');
  }

  deactivate(): void {
    this.state = { phase: 'select-a' };
    this.hoveredBody = null;
  }

  onMouseMove(canvasPt: CanvasPt): void {
    const wp = this.renderer.canvasToWorld(canvasPt.x, canvasPt.y);
    this.hoveredBody = this.hitTestBody(wp);
  }

  onMouseDown(canvasPt: CanvasPt): void {
    const wp = this.renderer.canvasToWorld(canvasPt.x, canvasPt.y);
    const body = this.hitTestBody(wp);
    if (!body) return;

    if (this.state.phase === 'select-a') {
      this.state = { phase: 'select-b', bodyA: body };
      this.statusCallback?.('Force link — click Body B');

    } else if (this.state.phase === 'select-b') {
      if (body === this.state.bodyA) return;   // can't link a body to itself
      this.onCommit({
        bodyA: this.state.bodyA,
        bodyB: body,
        ...DEFAULT_FORCE_LINK_PARAMS,
      });
      this.state = { phase: 'select-a' };
      this.statusCallback?.('Force link — click Body A');
    }
  }

  /** Draw hover highlights and body-A selection highlight during placement. */
  drawPreview(): void {
    const ctx = this.renderer.getContext();

    // Highlight body A selection while choosing body B
    if (this.state.phase === 'select-b') {
      ctx.save();
      ctx.strokeStyle = SELECTED_A_COLOR;
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 3]);
      this.strokeBody(ctx, this.state.bodyA);
      ctx.restore();
    }

    // Hover highlight (skip body A in phase select-b to avoid double-drawing)
    if (this.hoveredBody && (this.state.phase === 'select-a' || this.hoveredBody !== this.state.bodyA)) {
      ctx.save();
      ctx.strokeStyle = HOVER_COLOR;
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 3]);
      this.strokeBody(ctx, this.hoveredBody);
      ctx.restore();
    }
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private strokeBody(ctx: CanvasRenderingContext2D, body: planck.Body): void {
    for (let f = body.getFixtureList(); f; f = f.getNext()) {
      this.strokeFixture(ctx, body, f);
    }
  }

  private strokeFixture(ctx: CanvasRenderingContext2D, body: planck.Body, fixture: planck.Fixture): void {
    const shape = fixture.getShape();
    const type  = shape.getType();
    ctx.beginPath();

    if (type === 'circle') {
      const s  = shape as planck.CircleShape;
      const cp = this.renderer.worldToCanvas(body.getWorldPoint(s.getCenter()));
      const r  = this.renderer.worldLengthToPixels(s.getRadius());
      ctx.arc(cp.x, cp.y, r + 3, 0, Math.PI * 2);

    } else if (type === 'polygon') {
      const s     = shape as planck.PolygonShape;
      const count = (s as any).m_count as number;
      if (count === 0) return;
      const first = this.renderer.worldToCanvas(body.getWorldPoint(s.m_vertices[0]));
      ctx.moveTo(first.x, first.y);
      for (let i = 1; i < count; i++) {
        const p = this.renderer.worldToCanvas(body.getWorldPoint(s.m_vertices[i]));
        ctx.lineTo(p.x, p.y);
      }
      ctx.closePath();

    } else if (type === 'edge') {
      const s  = shape as planck.EdgeShape;
      const c1 = this.renderer.worldToCanvas(body.getWorldPoint(s.m_vertex1));
      const c2 = this.renderer.worldToCanvas(body.getWorldPoint(s.m_vertex2));
      ctx.moveTo(c1.x, c1.y);
      ctx.lineTo(c2.x, c2.y);

    } else if (type === 'chain') {
      const s     = shape as planck.ChainShape;
      const verts = s.m_vertices;
      if (verts.length === 0) return;
      const first = this.renderer.worldToCanvas(body.getWorldPoint(verts[0]));
      ctx.moveTo(first.x, first.y);
      for (let i = 1; i < verts.length; i++) {
        const p = this.renderer.worldToCanvas(body.getWorldPoint(verts[i]));
        ctx.lineTo(p.x, p.y);
      }
    }

    ctx.stroke();
  }

  private hitTestBody(wp: planck.Vec2): planck.Body | null {
    const tol  = this.renderer.pixelsToWorldLength(BODY_HIT_PX);
    const aabb = planck.AABB(
      planck.Vec2(wp.x - tol, wp.y - tol),
      planck.Vec2(wp.x + tol, wp.y + tol),
    );
    let hit: planck.Body | null = null;
    this.world.queryAABB(aabb, (fixture) => {
      hit = fixture.getBody();
      return false;
    });
    return hit;
  }
}
