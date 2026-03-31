import * as planck from 'planck';
import { Renderer } from '../rendering/renderer';
import { BodyUserData } from '../types/userData';

// ── Visual constants (all pixel measurements) ─────────────────────────────────

const HANDLE_RADIUS_PX        = 6;
const HANDLE_HIT_PX           = 12;    // larger than visual radius for easier grabbing
const ROTATE_HANDLE_OFFSET_PX = 30;    // pixels above body center in canvas space
const ROTATION_DEAD_ZONE_PX   = 8;     // must move this far before rotation begins
const ROTATION_SNAP_RAD       = Math.PI / 4;  // 45° snap increments when Shift is held

// ── Physics constants ──────────────────────────────────────────────────────────

const MIN_CIRCLE_RADIUS  = 0.05;   // world units — prevents degenerate shapes
const MIN_BOX_HALF       = 0.05;
const MIN_EDGE_LENGTH_SQ = 0.0001; // world units² — prevents zero-length edges

// ── Colors ────────────────────────────────────────────────────────────────────

const COLOR_HANDLE        = 'rgba(255, 204, 60, 0.9)';
const COLOR_HANDLE_ACTIVE = 'rgba(255, 255, 180, 1.0)';
const COLOR_ROTATE        = 'rgba(80, 180, 255, 0.9)';
const COLOR_ROTATE_ACTIVE = 'rgba(180, 220, 255, 1.0)';

// ── Types ──────────────────────────────────────────────────────────────────────

export type CanvasPt = { x: number; y: number };

type HandleKind =
  | { tag: 'circle-edge' }
  | { tag: 'box-corner';   vi: 0 | 2 }
  | { tag: 'poly-vertex';  i: number }
  | { tag: 'edge-end';     i: 0 | 1 }
  | { tag: 'chain-vertex'; i: number }
  | { tag: 'move' }   // move-body handle at midpoint (edge) or centroid (chain)
  | { tag: 'rotate' };

// ── Fixture property capture/restore ──────────────────────────────────────────

interface FixtureProps {
  density: number;
  friction: number;
  restitution: number;
  filterGroupIndex: number;
  filterCategoryBits: number;
  filterMaskBits: number;
}

function captureProps(f: planck.Fixture): FixtureProps {
  return {
    density: f.getDensity(),
    friction: f.getFriction(),
    restitution: f.getRestitution(),
    filterGroupIndex: f.getFilterGroupIndex(),
    filterCategoryBits: f.getFilterCategoryBits(),
    filterMaskBits: f.getFilterMaskBits(),
  };
}

/**
 * Destroy all fixtures on the body and create a new one with the given shape,
 * preserving physical properties. Call body.resetMassData() afterward to update inertia.
 *
 * Note: if fixture userData is ever used, add capture/restore logic here.
 */
function recreateFixture(body: planck.Body, shape: planck.Shape, props: FixtureProps): void {
  for (let f = body.getFixtureList(); f; ) {
    const next = f.getNext();
    body.destroyFixture(f);
    f = next;
  }
  const f = body.createFixture({
    shape,
    density: props.density,
    friction: props.friction,
    restitution: props.restitution,
  });
  f.setFilterData({
    groupIndex: props.filterGroupIndex,
    categoryBits: props.filterCategoryBits,
    maskBits: props.filterMaskBits,
  });
  body.resetMassData();
}

// ── Math helpers ───────────────────────────────────────────────────────────────

/** Rotate a 2D vector by angle (radians). */
function rotateVec(x: number, y: number, angle: number): { x: number; y: number } {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return { x: x * c - y * s, y: x * s + y * c };
}

// ── BodyHandles ────────────────────────────────────────────────────────────────

/**
 * Manages the editing handles drawn around a selected body.
 * Handles allow the user to reshape bodies (resize, move vertices, rotate) while paused.
 *
 * Handle types per shape:
 *   Circle   — one edge handle (drag to resize radius). No rotation handle.
 *   Box      — two opposite corner handles (drag to resize).
 *   Polygon  — one handle per vertex (drag to reposition).
 *   Edge     — two endpoint handles.
 *   Chain    — one handle per vertex.
 *   All except Circle also get a rotation handle 30 px above the body center.
 */
export class BodyHandles {
  private body: planck.Body | null = null;
  private renderer: Renderer;
  private isSimulationRunning: () => boolean;

  // Stable list of handle kinds for the current body.
  // Built once on setBody(); indices remain valid until setBody() is called again.
  private handles: HandleKind[] = [];

  private hoveredIndex = -1;  // index into this.handles, or -1
  private activeIndex  = -1;  // index of the handle being dragged, or -1

  // Rotation drag state (valid only while activeIndex points at a 'rotate' handle)
  private rotBodyAngleStart  = 0;
  private rotDeadZoneBroken  = false;
  private rotClickPt: CanvasPt = { x: 0, y: 0 };
  private rotStartMouseAngle = 0;    // set when dead zone breaks
  // World-space pivot and its local-space equivalent, captured at drag start.
  // For polygon/box the pivot equals body.getPosition() so no repositioning is needed.
  // For edge/chain the pivot is midpoint/centroid, so the body must be repositioned
  // each frame to keep that world point fixed as the angle changes.
  private rotPivotWorld: planck.Vec2 = planck.Vec2(0, 0);
  private rotLocalPivot: planck.Vec2 = planck.Vec2(0, 0);

  constructor(renderer: Renderer, isSimulationRunning: () => boolean) {
    this.renderer = renderer;
    this.isSimulationRunning = isSimulationRunning;
  }

  setBody(body: planck.Body | null): void {
    this.body     = body;
    this.handles  = body ? this.buildHandles(body) : [];
    this.hoveredIndex = -1;
    this.activeIndex  = -1;
  }

  isDragging(): boolean {
    return this.activeIndex >= 0;
  }

  /**
   * Returns true if a handle was grabbed and started dragging.
   * When true, the caller (SelectTool) should suppress its own body-drag logic.
   * Handles are only draggable while the simulation is paused.
   */
  onMouseDown(canvasPt: CanvasPt): boolean {
    if (!this.body || this.isSimulationRunning()) return false;

    const idx = this.hitTest(canvasPt);
    if (idx < 0) return false;

    this.activeIndex = idx;

    if (this.handles[idx].tag === 'rotate') {
      this.rotBodyAngleStart = this.body.getAngle();
      this.rotDeadZoneBroken = false;
      this.rotClickPt = { ...canvasPt };
      const pivot = this.shapeCenter(this.body);
      this.rotPivotWorld = planck.Vec2(pivot.x, pivot.y);
      this.rotLocalPivot = this.body.getLocalPoint(pivot);
    }

    return true;
  }

  onMouseMove(canvasPt: CanvasPt, worldPos: planck.Vec2, shiftKey: boolean): void {
    if (!this.body) return;

    if (this.activeIndex >= 0) {
      const kind = this.handles[this.activeIndex];
      if (kind.tag === 'rotate') {
        this.applyRotation(canvasPt, shiftKey);
      } else {
        this.applyShapeHandle(kind, worldPos);
      }
    } else {
      this.hoveredIndex = this.hitTest(canvasPt);
    }
  }

  onMouseUp(): void {
    this.activeIndex = -1;
  }

  /** Draw all handles for the current body. Call after the selection highlight. */
  draw(): void {
    if (!this.body || this.handles.length === 0) return;

    const ctx = this.renderer.getContext();
    const positions = this.computeCanvasPositions();

    // Draw handle dots
    ctx.save();
    ctx.setLineDash([]);
    for (let i = 0; i < this.handles.length; i++) {
      const isActive = i === this.activeIndex;
      const isHover  = !isActive && i === this.hoveredIndex;
      const isRotate = this.handles[i].tag === 'rotate';

      const color = isRotate
        ? (isActive || isHover ? COLOR_ROTATE_ACTIVE : COLOR_ROTATE)
        : (isActive || isHover ? COLOR_HANDLE_ACTIVE  : COLOR_HANDLE);

      const pt = positions[i];
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, HANDLE_RADIUS_PX, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.5)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    ctx.restore();
  }

  // ── Private ────────────────────────────────────────────────────────────────

  /**
   * Determine which handles to show based on the body's shape and shapeKind userData.
   * shapeKind distinguishes boxes (two corner handles) from free polygons (per-vertex handles).
   * Bodies without shapeKind (e.g. the initial ground plane) fall back to per-vertex for polygons.
   */
  private buildHandles(body: planck.Body): HandleKind[] {
    const fixture = body.getFixtureList();
    if (!fixture) return [];

    const shape = fixture.getShape();
    const type  = shape.getType();
    const ud    = body.getUserData() as BodyUserData | null;
    const sk    = ud?.shapeKind;

    const out: HandleKind[] = [];

    if (type === 'circle') {
      out.push({ tag: 'circle-edge' });
      // No rotation handle for circles (spec: "Each body type except Circle")

    } else if (type === 'polygon') {
      const s = shape as planck.PolygonShape;
      if (sk === 'box') {
        out.push({ tag: 'box-corner', vi: 0 });
        out.push({ tag: 'box-corner', vi: 2 });
      } else {
        const vertCount = (s as any).m_count as number;
        for (let i = 0; i < vertCount; i++) {
          out.push({ tag: 'poly-vertex', i });
        }
      }
      out.push({ tag: 'rotate' });

    } else if (type === 'edge') {
      out.push({ tag: 'edge-end', i: 0 });
      out.push({ tag: 'edge-end', i: 1 });
      out.push({ tag: 'move' });
      out.push({ tag: 'rotate' });

    } else if (type === 'chain') {
      const s = shape as planck.ChainShape;
      for (let i = 0; i < s.m_vertices.length; i++) {
        out.push({ tag: 'chain-vertex', i });
      }
      out.push({ tag: 'move' });
      out.push({ tag: 'rotate' });
    }

    return out;
  }

  /** Compute the current canvas position of every handle (called each frame). */
  private computeCanvasPositions(): CanvasPt[] {
    const body    = this.body!;
    const fixture = body.getFixtureList();
    if (!fixture) return [];
    const shape = fixture.getShape();
    const type  = shape.getType();

    // First pass: compute all non-rotate positions.
    const positions: CanvasPt[] = this.handles.map(kind => {
      if (kind.tag === 'rotate') return { x: 0, y: 0 }; // filled in second pass

      if (kind.tag === 'move') {
        return this.renderer.worldToCanvas(this.shapeCenter(body));
      }

      if (kind.tag === 'circle-edge' && type === 'circle') {
        const s  = shape as planck.CircleShape;
        const wc = body.getWorldPoint(s.getCenter());
        // Edge handle sits at the rightmost point of the circle in world space
        return this.renderer.worldToCanvas(planck.Vec2(wc.x + s.getRadius(), wc.y));
      }

      if ((kind.tag === 'box-corner' || kind.tag === 'poly-vertex') && type === 'polygon') {
        const s = shape as planck.PolygonShape;
        const vi = kind.tag === 'box-corner' ? kind.vi : kind.i;
        const vert = s.m_vertices[vi];
        if (!vert) return { x: 0, y: 0 };
        return this.renderer.worldToCanvas(body.getWorldPoint(vert));
      }

      if (kind.tag === 'edge-end' && type === 'edge') {
        const s = shape as planck.EdgeShape;
        const lv = kind.i === 0 ? s.m_vertex1 : s.m_vertex2;
        return this.renderer.worldToCanvas(body.getWorldPoint(lv));
      }

      if (kind.tag === 'chain-vertex' && type === 'chain') {
        const s = shape as planck.ChainShape;
        return this.renderer.worldToCanvas(body.getWorldPoint(s.m_vertices[kind.i]));
      }

      return { x: 0, y: 0 };
    });

    // Second pass: place the rotate handle above the topmost non-rotate handle.
    // Using the topmost handle position (rather than a fixed offset above the centroid)
    // ensures the rotate handle never overlaps vertex handles on tall/pointy shapes.
    const rotIdx = this.handles.findIndex(h => h.tag === 'rotate');
    if (rotIdx >= 0) {
      const center = this.renderer.worldToCanvas(this.shapeCenter(body));
      let topY = center.y;
      for (let i = 0; i < positions.length; i++) {
        if (this.handles[i].tag !== 'rotate') topY = Math.min(topY, positions[i].y);
      }
      positions[rotIdx] = { x: center.x, y: topY - ROTATE_HANDLE_OFFSET_PX };
    }

    return positions;
  }

  /** Returns the index of the handle within HIT_RADIUS_PX of canvasPt, or -1. */
  private hitTest(canvasPt: CanvasPt): number {
    const r2 = HANDLE_HIT_PX * HANDLE_HIT_PX;
    const positions = this.computeCanvasPositions();
    for (let i = 0; i < positions.length; i++) {
      const dx = canvasPt.x - positions[i].x;
      const dy = canvasPt.y - positions[i].y;
      if (dx * dx + dy * dy <= r2) return i;
    }
    return -1;
  }

  /**
   * Rotate the body based on mouse movement.
   * Canvas Y is down, so clockwise screen motion corresponds to a negative world-space angle delta.
   * A dead zone prevents the body from snapping wildly on first grab.
   */
  private applyRotation(canvasPt: CanvasPt, shiftKey: boolean): void {
    const body   = this.body!;
    const center = this.renderer.worldToCanvas(this.rotPivotWorld);

    if (!this.rotDeadZoneBroken) {
      const dx = canvasPt.x - this.rotClickPt.x;
      const dy = canvasPt.y - this.rotClickPt.y;
      if (Math.hypot(dx, dy) < ROTATION_DEAD_ZONE_PX) return;
      // Dead zone broken — record the current mouse angle as the rotation reference
      // (using current position avoids a sudden jump)
      this.rotDeadZoneBroken  = true;
      this.rotStartMouseAngle = Math.atan2(canvasPt.y - center.y, canvasPt.x - center.x);
    }

    const currentAngle = Math.atan2(canvasPt.y - center.y, canvasPt.x - center.x);
    let newAngle = this.rotBodyAngleStart - (currentAngle - this.rotStartMouseAngle);

    if (shiftKey) {
      newAngle = Math.round(newAngle / ROTATION_SNAP_RAD) * ROTATION_SNAP_RAD;
    }

    body.setAngle(newAngle);

    // Reposition the body so the pivot point stays fixed in world space.
    // For polygon/box bodies the local pivot is (0,0) so position is unchanged.
    // For edge/chain bodies the local pivot is the midpoint/centroid, so the body
    // origin must shift to keep that world point stationary.
    const lp  = this.rotLocalPivot;
    const cos = Math.cos(newAngle);
    const sin = Math.sin(newAngle);
    body.setPosition(planck.Vec2(
      this.rotPivotWorld.x - (lp.x * cos - lp.y * sin),
      this.rotPivotWorld.y - (lp.x * sin + lp.y * cos),
    ));

    body.setAwake(true);
  }

  /** Apply a single frame of a shape handle drag to the body's fixture geometry. */
  private applyShapeHandle(kind: HandleKind, worldPos: planck.Vec2): void {
    const body    = this.body!;
    const fixture = body.getFixtureList();
    if (!fixture) return;
    const shape = fixture.getShape();
    const props = captureProps(fixture);

    switch (kind.tag) {

      case 'move': {
        // Translate the whole body so its shape center follows the mouse
        const center = this.shapeCenter(body);
        const pos    = body.getPosition();
        body.setPosition(planck.Vec2(
          pos.x + worldPos.x - center.x,
          pos.y + worldPos.y - center.y,
        ));
        body.setAwake(true);
        break;
      }

      case 'circle-edge': {
        const s           = shape as planck.CircleShape;
        const worldCenter = body.getWorldPoint(s.getCenter());
        const newRadius   = Math.max(MIN_CIRCLE_RADIUS,
          Math.hypot(worldPos.x - worldCenter.x, worldPos.y - worldCenter.y));
        recreateFixture(body, new planck.CircleShape(newRadius), props);
        break;
      }

      case 'box-corner': {
        const s        = shape as planck.PolygonShape;
        const otherIdx = kind.vi === 0 ? 2 : 0;
        const opposite = body.getWorldPoint(s.m_vertices[otherIdx]);

        // New body center = midpoint between dragged corner and opposite corner
        const newCenter = planck.Vec2(
          (worldPos.x + opposite.x) / 2,
          (worldPos.y + opposite.y) / 2,
        );

        // Transform the drag position into the body's local frame to get half-extents
        const local = rotateVec(
          worldPos.x - newCenter.x,
          worldPos.y - newCenter.y,
          -body.getAngle(),
        );
        const hw = Math.max(MIN_BOX_HALF, Math.abs(local.x));
        const hh = Math.max(MIN_BOX_HALF, Math.abs(local.y));

        body.setPosition(newCenter);
        body.setAwake(true);
        recreateFixture(body, new planck.BoxShape(hw, hh), props);
        break;
      }

      case 'poly-vertex': {
        const s     = shape as planck.PolygonShape;
        const count = (s as any).m_count as number;

        // Find the vertex closest to the mouse in world space and move it.
        // This avoids relying on a stored index that may become stale when
        // planck.js reorders vertices during convex hull computation.
        let closestIdx    = 0;
        let closestDistSq = Infinity;
        for (let j = 0; j < count; j++) {
          const wv = body.getWorldPoint(s.m_vertices[j]);
          const dx = wv.x - worldPos.x;
          const dy = wv.y - worldPos.y;
          const distSq = dx * dx + dy * dy;
          if (distSq < closestDistSq) { closestDistSq = distSq; closestIdx = j; }
        }

        const newLocal = body.getLocalPoint(worldPos);
        const oldVerts = s.m_vertices.slice(0, count).map(v => planck.Vec2(v.x, v.y));
        const newVerts = oldVerts.map((v, j) =>
          j === closestIdx ? planck.Vec2(newLocal.x, newLocal.y) : v
        );

        try {
          const newShape = new planck.PolygonShape(newVerts);
          // planck.js silently drops vertices that would make the polygon non-convex;
          // check that no vertex was lost before applying.
          if ((newShape as any).m_count === count) {
            recreateFixture(body, newShape, props);
            // Rebuild all handles so every handle index is correct after any hull reorder,
            // then update activeIndex to the handle closest to the mouse in the new shape.
            this.handles = this.buildHandles(body);
            this.hoveredIndex = -1;
            const updatedShape = body.getFixtureList()!.getShape() as planck.PolygonShape;
            let newActiveIdx = this.activeIndex;
            let bestDistSq   = Infinity;
            for (let j = 0; j < this.handles.length; j++) {
              const h = this.handles[j];
              if (h.tag !== 'poly-vertex') continue;
              const wv = body.getWorldPoint(updatedShape.m_vertices[h.i]);
              const dx = wv.x - worldPos.x;
              const dy = wv.y - worldPos.y;
              const distSq = dx * dx + dy * dy;
              if (distSq < bestDistSq) { bestDistSq = distSq; newActiveIdx = j; }
            }
            this.activeIndex = newActiveIdx;
          }
        } catch {
          // Polygon became degenerate — leave fixture unchanged
        }
        break;
      }

      case 'edge-end': {
        const s        = shape as planck.EdgeShape;
        const newLocal = body.getLocalPoint(worldPos);
        const v1 = kind.i === 0 ? newLocal : planck.Vec2(s.m_vertex1.x, s.m_vertex1.y);
        const v2 = kind.i === 1 ? newLocal : planck.Vec2(s.m_vertex2.x, s.m_vertex2.y);
        // Skip update if drag would produce a zero-length edge
        if ((v2.x - v1.x) ** 2 + (v2.y - v1.y) ** 2 < MIN_EDGE_LENGTH_SQ) break;
        recreateFixture(body, new planck.EdgeShape(v1, v2), props);
        break;
      }

      case 'chain-vertex': {
        const s        = shape as planck.ChainShape;
        const newLocal = body.getLocalPoint(worldPos);
        const verts    = s.m_vertices.map((v, j) =>
          j === kind.i ? planck.Vec2(newLocal.x, newLocal.y) : planck.Vec2(v.x, v.y)
        );
        const isLoop = (s as any).m_isLoop ?? false;
        recreateFixture(body, new planck.ChainShape(verts, isLoop), props);
        break;
      }
    }
  }

  /**
   * Returns the natural visual center of the body's shape in world space:
   * - Edge: midpoint of the two endpoints
   * - Chain: mean of all vertices
   * - Everything else: body origin (polygon/box centroid is always at the origin)
   */
  private shapeCenter(body: planck.Body): planck.Vec2 {
    const fixture = body.getFixtureList();
    if (!fixture) return body.getPosition();
    const shape = fixture.getShape();
    const type  = shape.getType();

    if (type === 'edge') {
      const s  = shape as planck.EdgeShape;
      const v1 = body.getWorldPoint(s.m_vertex1);
      const v2 = body.getWorldPoint(s.m_vertex2);
      return planck.Vec2((v1.x + v2.x) / 2, (v1.y + v2.y) / 2);
    }

    if (type === 'chain') {
      const s     = shape as planck.ChainShape;
      const verts = s.m_vertices;
      let cx = 0; let cy = 0;
      for (const v of verts) {
        const wv = body.getWorldPoint(v);
        cx += wv.x; cy += wv.y;
      }
      return planck.Vec2(cx / verts.length, cy / verts.length);
    }

    return body.getPosition();
  }
}
