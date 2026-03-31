import * as planck from 'planck';
import { Renderer } from '../rendering/renderer';
import { BodyHandles, CanvasPt } from './bodyHandles';

/** Squared distance from point p to the nearest point on segment (a, b). */
function pointToSegmentDistSq(p: planck.Vec2, a: planck.Vec2, b: planck.Vec2): number {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const lenSq = abx * abx + aby * aby;
  if (lenSq === 0) {
    const dx = p.x - a.x; const dy = p.y - a.y;
    return dx * dx + dy * dy;
  }
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * abx + (p.y - a.y) * aby) / lenSq));
  const dx = p.x - (a.x + t * abx);
  const dy = p.y - (a.y + t * aby);
  return dx * dx + dy * dy;
}

// MouseJoint parameters for dragging bodies during simulation
const DRAG_FREQUENCY_HZ        = 5.0;
const DRAG_DAMPING_RATIO       = 0.7;
const DRAG_MAX_FORCE_MULTIPLIER = 1000.0; // multiplied by body mass

// How close the click AABB query half-extent is in world units
const HIT_TEST_HALF_EXTENT = 0.01;

// Click tolerance for edge/chain shapes in screen pixels — converted to world units at query time
const LINE_HIT_PIXELS = 14;

export class SelectTool {
  private world: planck.World;
  private renderer: Renderer;
  private isSimulationRunning: () => boolean;

  private selectedBody: planck.Body | null = null;
  private onSelectCallback: ((body: planck.Body | null) => void) | null = null;

  private handles: BodyHandles;

  // MouseJoint used while dragging during simulation
  private dragAnchorBody: planck.Body;
  private mouseJoint: planck.MouseJoint | null = null;

  // Offset from body origin to drag grab point, used for paused direct-position dragging
  private dragOffset: planck.Vec2 | null = null;

  constructor(world: planck.World, renderer: Renderer, isSimulationRunning: () => boolean) {
    this.world = world;
    this.renderer = renderer;
    this.isSimulationRunning = isSimulationRunning;

    this.handles = new BodyHandles(renderer, isSimulationRunning);

    // A permanent static body used as the anchor for MouseJoint dragging
    this.dragAnchorBody = world.createBody({ type: 'static' });
  }

  getSelectedBody(): planck.Body | null {
    return this.selectedBody;
  }

  onSelect(callback: (body: planck.Body | null) => void): void {
    this.onSelectCallback = callback;
  }

  /**
   * Destroy the currently selected body and clear the selection.
   * Returns true if a body was deleted, false if nothing was selected.
   * The world's remove-body hook handles any application-level cleanup.
   */
  deleteSelected(): boolean {
    if (!this.selectedBody) return false;
    this.endDrag();
    this.world.destroyBody(this.selectedBody);
    // selectedBody is now a dangling reference — clear it before any callbacks fire
    this.selectedBody = null;
    this.handles.setBody(null);
    this.onSelectCallback?.(null);
    return true;
  }

  /** Call when the select tool is deactivated to clean up state. */
  deactivate(): void {
    this.endDrag();
    this.handles.setBody(null);
    this.selectedBody = null;
    this.onSelectCallback?.(null);
  }

  onMouseDown(worldPos: planck.Vec2, canvasPt: CanvasPt): void {
    // Handle drags take priority over body drags, but only when paused
    if (this.handles.onMouseDown(canvasPt)) return;

    const hit = this.hitTest(worldPos);
    if (hit) {
      this.selectedBody = hit;
      this.beginDrag(hit, worldPos);
    } else {
      this.selectedBody = null;
    }
    this.handles.setBody(this.selectedBody);
    this.onSelectCallback?.(this.selectedBody);
  }

  onMouseMove(worldPos: planck.Vec2, canvasPt: CanvasPt, shiftKey: boolean): void {
    // Always forward to handles (updates hover highlight and applies active handle drags)
    this.handles.onMouseMove(canvasPt, worldPos, shiftKey);

    // Only apply body drag if no handle is being dragged
    if (!this.handles.isDragging()) {
      if (this.mouseJoint) {
        // Simulation running — update MouseJoint target
        this.mouseJoint.setTarget(worldPos);
      } else if (this.dragOffset && this.selectedBody) {
        // Simulation paused — move body directly
        const newPos = planck.Vec2(
          worldPos.x - this.dragOffset.x,
          worldPos.y - this.dragOffset.y,
        );
        this.selectedBody.setPosition(newPos);
        this.selectedBody.setAwake(true);
      }
    }
  }

  onMouseUp(): void {
    this.handles.onMouseUp();
    this.endDrag();
  }

  /** Draw a highlight outline around the selected body, then draw editing handles. */
  drawSelection(): void {
    if (!this.selectedBody) return;

    const ctx = this.renderer.getContext();

    ctx.save();
    ctx.strokeStyle = 'rgba(100, 180, 255, 0.9)';
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 3]);

    for (let fixture = this.selectedBody.getFixtureList(); fixture; fixture = fixture.getNext()) {
      this.drawFixtureHighlight(ctx, this.selectedBody, fixture);
    }

    ctx.restore();

    // Handles draw on top of the selection outline
    this.handles.draw();
  }

  private drawFixtureHighlight(
    ctx: CanvasRenderingContext2D,
    body: planck.Body,
    fixture: planck.Fixture,
  ): void {
    const shape = fixture.getShape();
    const type  = shape.getType();

    ctx.beginPath();

    if (type === 'circle') {
      const s      = shape as planck.CircleShape;
      const center = body.getWorldPoint(s.getCenter());
      const cp     = this.renderer.worldToCanvas(center);
      const r      = this.renderer.worldLengthToPixels(s.getRadius());
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

  private hitTest(worldPos: planck.Vec2): planck.Body | null {
    let hitBody: planck.Body | null = null;

    // Use pixel-based tolerance for line shapes, converted to world units at current zoom
    const lineTolWorld = this.renderer.pixelsToWorldLength(LINE_HIT_PIXELS);

    const aabb = planck.AABB(
      planck.Vec2(worldPos.x - lineTolWorld, worldPos.y - lineTolWorld),
      planck.Vec2(worldPos.x + lineTolWorld, worldPos.y + lineTolWorld),
    );

    this.world.queryAABB(aabb, (fixture) => {
      if (this.fixtureHitTest(fixture, worldPos, lineTolWorld)) {
        hitBody = fixture.getBody();
        return false; // stop at first hit
      }
      return true;
    });

    return hitBody;
  }

  /**
   * Per-shape hit test. Circle and polygon use testPoint (filled interior).
   * Edge and chain use point-to-segment distance since they have no interior.
   * lineTolWorld is LINE_HIT_PIXELS converted to world units at the current zoom.
   */
  private fixtureHitTest(fixture: planck.Fixture, worldPos: planck.Vec2, lineTolWorld: number): boolean {
    const shape = fixture.getShape();
    const body  = fixture.getBody();
    const type  = shape.getType();

    if (type === 'circle' || type === 'polygon') {
      return fixture.testPoint(worldPos);
    }

    if (type === 'edge') {
      const s  = shape as planck.EdgeShape;
      const v1 = body.getWorldPoint(s.m_vertex1);
      const v2 = body.getWorldPoint(s.m_vertex2);
      return pointToSegmentDistSq(worldPos, v1, v2) <= lineTolWorld * lineTolWorld;
    }

    if (type === 'chain') {
      const s     = shape as planck.ChainShape;
      const verts = s.m_vertices;
      for (let i = 0; i < verts.length - 1; i++) {
        const v1 = body.getWorldPoint(verts[i]);
        const v2 = body.getWorldPoint(verts[i + 1]);
        if (pointToSegmentDistSq(worldPos, v1, v2) <= lineTolWorld * lineTolWorld) {
          return true;
        }
      }
      return false;
    }

    return false;
  }

  private beginDrag(body: planck.Body, worldPos: planck.Vec2): void {
    body.setAwake(true);

    if (this.isSimulationRunning() && body.getType() !== 'static') {
      const mass = body.getMass();
      this.mouseJoint = this.world.createJoint(new planck.MouseJoint(
        {
          maxForce: DRAG_MAX_FORCE_MULTIPLIER * mass,
          frequencyHz: DRAG_FREQUENCY_HZ,
          dampingRatio: DRAG_DAMPING_RATIO,
        },
        this.dragAnchorBody,
        body,
        worldPos,
      )) as planck.MouseJoint;
    } else {
      const pos = body.getPosition();
      this.dragOffset = planck.Vec2(worldPos.x - pos.x, worldPos.y - pos.y);
    }
  }

  private endDrag(): void {
    if (this.mouseJoint) {
      this.world.destroyJoint(this.mouseJoint);
      this.mouseJoint = null;
    }
    this.dragOffset = null;
  }
}
