import * as planck from 'planck';
import { Renderer } from '../rendering/renderer';
import { getJointAnchorPoints } from '../rendering/joints';

type CP = { x: number; y: number };

// ── Tool type groupings ────────────────────────────────────────────────────────

type AWBTool  = 'revolute-joint' | 'weld-joint' | 'friction-joint';
type AxisTool = 'prismatic-joint' | 'wheel-joint';
type DRTool   = 'distance-joint' | 'rope-joint';

export type JointToolType =
  | AWBTool | AxisTool | DRTool
  | 'motor-joint' | 'pulley-joint' | 'gear-joint';

// ── Constants ─────────────────────────────────────────────────────────────────

/** Ctrl-snap attraction radius in pixels. */
const SNAP_PIXELS    = 20;

/**
 * Hit radius (px) when clicking an existing revolute/prismatic joint anchor
 * to select it for gear-joint creation.  Matches the 14 px used by SelectTool
 * for joint selection so the click targets feel consistent.
 */
const GEAR_JOINT_HIT_PX = 14;

/** Minimum drag distance in pixels before axis is committed. */
const MIN_AXIS_PX    = 4;

/** Axis preview half-length in pixels. */
const AXIS_HALF_PX   = 40;

/** Arrowhead size in pixels. */
const ARROW_SIZE_PX  = 8;

// Preview colors
const C_PREVIEW      = 'rgba(180, 255, 180, 0.85)';
const C_HOVER_BODY   = 'rgba(100, 200, 255, 0.45)';
const C_HOVER_JOINT  = 'rgba(80, 255, 160, 0.55)';
const C_SNAP_DOT     = 'rgba(255, 210, 60, 0.95)';
const PREVIEW_DOT_R  = 5;
const PREVIEW_DASH: number[] = [5, 4];
const PREVIEW_LINE_W = 1.5;

// ── Placement state machine ────────────────────────────────────────────────────

type JointPhase =
  | { phase: 'idle' }
  // AWB (Anchor → BodyA → BodyB): revolute, weld, friction
  | { phase: 'awb-anchor'; tool: AWBTool }
  | { phase: 'awb-bodyA';  tool: AWBTool; anchor: planck.Vec2 }
  | { phase: 'awb-bodyB';  tool: AWBTool; anchor: planck.Vec2; bodyA: planck.Body }
  // Axis (Anchor → Axis-drag → BodyA → BodyB): prismatic, wheel
  | { phase: 'axis-anchor'; tool: AxisTool }
  | { phase: 'axis-placed'; tool: AxisTool; anchor: planck.Vec2 }   // anchor committed, waiting for drag
  | { phase: 'axis-drag';   tool: AxisTool; anchor: planck.Vec2; anchorCanvas: CP }
  | { phase: 'axis-bodyA';  tool: AxisTool; anchor: planck.Vec2; axis: planck.Vec2 }
  | { phase: 'axis-bodyB';  tool: AxisTool; anchor: planck.Vec2; axis: planck.Vec2; bodyA: planck.Body }
  // DR (two-anchor): distance, rope
  | { phase: 'dr-anchorA'; tool: DRTool }
  | { phase: 'dr-anchorB'; tool: DRTool; anchorA: planck.Vec2; bodyA: planck.Body }
  // Motor (body-to-body, no anchor)
  | { phase: 'motor-bodyA' }
  | { phase: 'motor-bodyB'; bodyA: planck.Body }
  // Pulley (4-step)
  | { phase: 'pulley-anchorA' }
  | { phase: 'pulley-anchorB'; anchorA: planck.Vec2; bodyA: planck.Body }
  | { phase: 'pulley-groundA'; anchorA: planck.Vec2; bodyA: planck.Body; anchorB: planck.Vec2; bodyB: planck.Body }
  | { phase: 'pulley-groundB'; anchorA: planck.Vec2; bodyA: planck.Body; anchorB: planck.Vec2; bodyB: planck.Body; groundA: planck.Vec2 }
  // Gear (select two existing revolute/prismatic joints)
  | { phase: 'gear-joint1' }
  | { phase: 'gear-joint2'; joint1: planck.RevoluteJoint | planck.PrismaticJoint };

// ── JointTool ──────────────────────────────────────────────────────────────────

export class JointTool {
  private world: planck.World;
  private renderer: Renderer;
  private activeTool: JointToolType | null = null;
  private state: JointPhase = { phase: 'idle' };

  // Current mouse position in world and canvas space, updated every move event
  private mouseWorld: planck.Vec2 = planck.Vec2(0, 0);
  private mouseCanvas: CP = { x: 0, y: 0 };

  // Shift key state, tracked for axis snapping during preview
  private shiftKey: boolean = false;

  // Snap state — updated on every move/down when Ctrl is active
  private snapWorld: planck.Vec2 = planck.Vec2(0, 0);
  private isSnapped: boolean = false;

  // Hover targets — updated on every mousemove
  private hoverBody: planck.Body | null = null;
  private hoverJoint: planck.RevoluteJoint | planck.PrismaticJoint | null = null;

  private jointCreatedCallback: ((joint: planck.Joint) => void) | null = null;
  private statusCallback: ((text: string) => void) | null = null;
  private onBeforeChange: (() => void) | null = null;

  constructor(world: planck.World, renderer: Renderer) {
    this.world = world;
    this.renderer = renderer;
  }

  onJointCreated(cb: (joint: planck.Joint) => void): void {
    this.jointCreatedCallback = cb;
  }

  onStatusChange(cb: (text: string) => void): void {
    this.statusCallback = cb;
  }

  setOnBeforeChange(cb: (() => void) | null): void {
    this.onBeforeChange = cb;
  }

  isActive(): boolean {
    return this.activeTool !== null && this.state.phase !== 'idle';
  }

  activate(tool: JointToolType): void {
    this.activeTool = tool;
    this.state = this.initialPhase(tool);
    this.hoverBody = null;
    this.hoverJoint = null;
    this.isSnapped = false;
    this.emitStatus();
  }

  deactivate(): void {
    this.activeTool = null;
    this.state = { phase: 'idle' };
    this.hoverBody = null;
    this.hoverJoint = null;
  }

  /** Call before activating to clear state without re-emitting status. */
  onMouseMove(worldPos: planck.Vec2, canvasPos: CP, ctrlKey: boolean, shiftKey: boolean): void {
    this.mouseWorld = worldPos;
    this.mouseCanvas = canvasPos;
    this.shiftKey = shiftKey;
    this.updateSnap(worldPos, ctrlKey);
    this.updateHover(worldPos, canvasPos);
  }

  /**
   * Called on left mousedown.  Returns true if the event was consumed by this tool.
   * For axis joints this starts the axis drag once the anchor has already been placed.
   */
  onMouseDown(worldPos: planck.Vec2, canvasPos: CP, ctrlKey: boolean): boolean {
    if (this.state.phase !== 'axis-placed') return false;

    this.state = { phase: 'axis-drag', tool: this.state.tool, anchor: this.state.anchor, anchorCanvas: canvasPos };
    return true;
  }

  /**
   * Called on left mouseup.  This is the primary event that advances the placement state.
   */
  onMouseUp(worldPos: planck.Vec2, canvasPos: CP, ctrlKey: boolean, shiftKey: boolean): void {
    if (this.state.phase === 'idle') return;

    this.shiftKey = shiftKey;
    this.updateSnap(worldPos, ctrlKey);
    // Refresh hover state in case the user clicked without moving the mouse first
    this.updateHover(worldPos, canvasPos);

    const snapped = this.isSnapped
      ? planck.Vec2(this.snapWorld.x, this.snapWorld.y)
      : planck.Vec2(worldPos.x, worldPos.y);

    switch (this.state.phase) {

      // ── AWB ──────────────────────────────────────────────────────────────────

      case 'awb-anchor': {
        this.state = { phase: 'awb-bodyA', tool: this.state.tool, anchor: snapped };
        this.emitStatus();
        break;
      }
      case 'awb-bodyA': {
        const body = this.hoverBody;
        if (!body) break;
        this.state = { phase: 'awb-bodyB', tool: this.state.tool, anchor: this.state.anchor, bodyA: body };
        this.emitStatus();
        break;
      }
      case 'awb-bodyB': {
        const body = this.hoverBody;
        if (!body || body === this.state.bodyA) break;
        this.onBeforeChange?.();
        this.createAWBJoint(this.state.tool, this.state.bodyA, body, this.state.anchor);
        this.activate(this.activeTool!);
        break;
      }

      // ── Axis ─────────────────────────────────────────────────────────────────

      case 'axis-anchor': {
        // Simple click places the anchor; the user then separately drags to set the axis
        this.state = { phase: 'axis-placed', tool: this.state.tool, anchor: snapped };
        this.emitStatus();
        break;
      }
      case 'axis-drag': {
        const { anchor, anchorCanvas, tool } = this.state;
        const dragPx = Math.hypot(canvasPos.x - anchorCanvas.x, canvasPos.y - anchorCanvas.y);
        if (dragPx < MIN_AXIS_PX) {
          // Not enough drag — keep anchor placed, let the user drag again
          this.state = { phase: 'axis-placed', tool, anchor };
          this.emitStatus();
          break;
        }
        const axis = this.computeAxisDir(anchor, worldPos, shiftKey);
        this.state = { phase: 'axis-bodyA', tool, anchor, axis };
        this.emitStatus();
        break;
      }
      case 'axis-bodyA': {
        const body = this.hoverBody;
        if (!body) break;
        this.state = { phase: 'axis-bodyB', tool: this.state.tool, anchor: this.state.anchor, axis: this.state.axis, bodyA: body };
        this.emitStatus();
        break;
      }
      case 'axis-bodyB': {
        const body = this.hoverBody;
        if (!body || body === this.state.bodyA) break;
        this.onBeforeChange?.();
        this.createAxisJoint(this.state.tool, this.state.bodyA, body, this.state.anchor, this.state.axis);
        this.activate(this.activeTool!);
        break;
      }

      // ── DR (Distance / Rope) ─────────────────────────────────────────────────

      case 'dr-anchorA': {
        const body = this.hoverBody;
        if (!body) break;
        this.state = { phase: 'dr-anchorB', tool: this.state.tool, anchorA: snapped, bodyA: body };
        this.emitStatus();
        break;
      }
      case 'dr-anchorB': {
        const body = this.hoverBody;
        if (!body || body === this.state.bodyA) break;
        this.onBeforeChange?.();
        this.createDRJoint(this.state.tool, this.state.bodyA, this.state.anchorA, body, snapped);
        this.activate(this.activeTool!);
        break;
      }

      // ── Motor ─────────────────────────────────────────────────────────────────

      case 'motor-bodyA': {
        const body = this.hoverBody;
        if (!body) break;
        this.state = { phase: 'motor-bodyB', bodyA: body };
        this.emitStatus();
        break;
      }
      case 'motor-bodyB': {
        const body = this.hoverBody;
        if (!body || body === this.state.bodyA) break;
        this.onBeforeChange?.();
        this.createMotorJoint(this.state.bodyA, body);
        this.activate(this.activeTool!);
        break;
      }

      // ── Pulley ────────────────────────────────────────────────────────────────

      case 'pulley-anchorA': {
        const body = this.hoverBody;
        if (!body) break;
        this.state = { phase: 'pulley-anchorB', anchorA: snapped, bodyA: body };
        this.emitStatus();
        break;
      }
      case 'pulley-anchorB': {
        const body = this.hoverBody;
        if (!body || body === this.state.bodyA) break;
        this.state = {
          phase: 'pulley-groundA',
          anchorA: this.state.anchorA, bodyA: this.state.bodyA,
          anchorB: snapped, bodyB: body,
        };
        this.emitStatus();
        break;
      }
      case 'pulley-groundA': {
        // Ground anchors can be anywhere (no body required)
        this.state = {
          phase: 'pulley-groundB',
          anchorA: this.state.anchorA, bodyA: this.state.bodyA,
          anchorB: this.state.anchorB, bodyB: this.state.bodyB,
          groundA: snapped,
        };
        this.emitStatus();
        break;
      }
      case 'pulley-groundB': {
        const { anchorA, bodyA, anchorB, bodyB, groundA } = this.state;
        this.onBeforeChange?.();
        this.createPulleyJoint(bodyA, anchorA, bodyB, anchorB, groundA, snapped);
        this.activate(this.activeTool!);
        break;
      }

      // ── Gear ──────────────────────────────────────────────────────────────────

      case 'gear-joint1': {
        const j = this.hoverJoint;
        if (!j) break;
        this.state = { phase: 'gear-joint2', joint1: j };
        this.emitStatus();
        break;
      }
      case 'gear-joint2': {
        const j = this.hoverJoint;
        if (!j || j === this.state.joint1) break;
        this.onBeforeChange?.();
        this.createGearJoint(this.state.joint1, j);
        this.activate(this.activeTool!);
        break;
      }
    }
  }

  onKeyDown(e: KeyboardEvent): void {
    if (e.key === 'Escape' && this.activeTool) {
      e.preventDefault();
      this.activate(this.activeTool);   // reset to initial placement step
    }
  }

  /** Draw placement preview and hover highlights. Called each frame by the render loop. */
  drawPreview(): void {
    if (!this.activeTool || this.state.phase === 'idle') return;

    const ctx  = this.renderer.getContext();
    const snap = this.isSnapped ? this.renderer.worldToCanvas(this.snapWorld) : this.mouseCanvas;

    ctx.save();

    // ── Hover highlights ─────────────────────────────────────────────────────

    if (this.hoverBody) {
      this.drawBodyHighlight(ctx, this.hoverBody, C_HOVER_BODY);
    }

    if (this.hoverJoint) {
      const pts = getJointAnchorPoints(this.hoverJoint);
      for (const wp of pts) {
        const cp = this.renderer.worldToCanvas(wp);
        ctx.beginPath();
        ctx.arc(cp.x, cp.y, GEAR_JOINT_HIT_PX, 0, Math.PI * 2);
        ctx.fillStyle = C_HOVER_JOINT;
        ctx.fill();
      }
    }

    // ── Placement preview ────────────────────────────────────────────────────

    ctx.strokeStyle = C_PREVIEW;
    ctx.fillStyle   = C_SNAP_DOT;
    ctx.lineWidth   = PREVIEW_LINE_W;
    ctx.setLineDash([]);

    switch (this.state.phase) {

      // ── AWB anchor preview (following mouse, snapping with Ctrl) ─────────────
      case 'awb-anchor':
        this.drawDot(ctx, snap);
        break;

      // ── AWB body selection: show placed anchor ───────────────────────────────
      case 'awb-bodyA':
      case 'awb-bodyB': {
        const cpAnchor = this.renderer.worldToCanvas(this.state.anchor);
        this.drawDot(ctx, cpAnchor);
        if (this.state.phase === 'awb-bodyB' && this.hoverBody) {
          // Faint line from anchor to hovered body for context
          ctx.beginPath();
          ctx.setLineDash(PREVIEW_DASH);
          ctx.moveTo(cpAnchor.x, cpAnchor.y);
          ctx.lineTo(this.mouseCanvas.x, this.mouseCanvas.y);
          ctx.stroke();
          ctx.setLineDash([]);
        }
        break;
      }

      // ── Axis anchor preview ──────────────────────────────────────────────────
      case 'axis-anchor':
        this.drawDot(ctx, snap);
        break;

      // ── Axis placed: anchor committed, waiting for drag ───────────────────────
      case 'axis-placed':
        this.drawDot(ctx, this.renderer.worldToCanvas(this.state.anchor));
        break;

      // ── Axis drag: show anchor + live axis arrow ──────────────────────────────
      case 'axis-drag': {
        const { anchor, anchorCanvas } = this.state;
        this.drawDot(ctx, anchorCanvas);
        const dragPx = Math.hypot(
          this.mouseCanvas.x - anchorCanvas.x,
          this.mouseCanvas.y - anchorCanvas.y,
        );
        if (dragPx >= MIN_AXIS_PX) {
          const axis = this.computeAxisDir(anchor, this.mouseWorld, this.shiftKey);
          this.drawAxisPreview(ctx, anchor, axis);
        }
        break;
      }

      // ── Axis body selection: show anchor + committed axis ────────────────────
      case 'axis-bodyA':
      case 'axis-bodyB': {
        this.drawDot(ctx, this.renderer.worldToCanvas(this.state.anchor));
        this.drawAxisPreview(ctx, this.state.anchor, this.state.axis);
        break;
      }

      // ── DR anchor A preview ──────────────────────────────────────────────────
      case 'dr-anchorA':
        this.drawDot(ctx, snap);
        break;

      // ── DR anchor B preview: show first anchor + dashed line to cursor ───────
      case 'dr-anchorB': {
        const cpA = this.renderer.worldToCanvas(this.state.anchorA);
        this.drawDot(ctx, cpA);
        this.drawDot(ctx, snap);
        ctx.beginPath();
        ctx.setLineDash(PREVIEW_DASH);
        ctx.moveTo(cpA.x, cpA.y);
        ctx.lineTo(snap.x, snap.y);
        ctx.stroke();
        ctx.setLineDash([]);
        break;
      }

      // ── Motor: no preview besides hover highlight ─────────────────────────────
      case 'motor-bodyA':
      case 'motor-bodyB':
        break;

      // ── Pulley anchor A preview ───────────────────────────────────────────────
      case 'pulley-anchorA':
        this.drawDot(ctx, snap);
        break;

      // ── Pulley anchor B: show first anchor + dashed line ─────────────────────
      case 'pulley-anchorB': {
        const cpA = this.renderer.worldToCanvas(this.state.anchorA);
        this.drawDot(ctx, cpA);
        this.drawDot(ctx, snap);
        ctx.beginPath(); ctx.setLineDash(PREVIEW_DASH);
        ctx.moveTo(cpA.x, cpA.y); ctx.lineTo(snap.x, snap.y);
        ctx.stroke(); ctx.setLineDash([]);
        break;
      }

      // ── Pulley ground A: show both body anchors + lines to cursor ─────────────
      case 'pulley-groundA': {
        const cpA = this.renderer.worldToCanvas(this.state.anchorA);
        const cpB = this.renderer.worldToCanvas(this.state.anchorB);
        this.drawDot(ctx, cpA); this.drawDot(ctx, cpB);
        ctx.beginPath(); ctx.setLineDash(PREVIEW_DASH);
        ctx.moveTo(cpA.x, cpA.y); ctx.lineTo(snap.x, snap.y);
        ctx.moveTo(snap.x, snap.y); ctx.lineTo(cpB.x, cpB.y);
        ctx.stroke(); ctx.setLineDash([]);
        this.drawDot(ctx, snap);
        break;
      }

      // ── Pulley ground B: show full rope diagram ───────────────────────────────
      case 'pulley-groundB': {
        const cpA  = this.renderer.worldToCanvas(this.state.anchorA);
        const cpB  = this.renderer.worldToCanvas(this.state.anchorB);
        const cpGA = this.renderer.worldToCanvas(this.state.groundA);
        this.drawDot(ctx, cpA); this.drawDot(ctx, cpB); this.drawDot(ctx, cpGA);
        ctx.beginPath(); ctx.setLineDash(PREVIEW_DASH);
        ctx.moveTo(cpA.x,  cpA.y);  ctx.lineTo(cpGA.x, cpGA.y);
        ctx.moveTo(cpGA.x, cpGA.y); ctx.lineTo(snap.x, snap.y);
        ctx.moveTo(snap.x, snap.y); ctx.lineTo(cpB.x,  cpB.y);
        ctx.stroke(); ctx.setLineDash([]);
        this.drawDot(ctx, snap);
        break;
      }

      // ── Gear: show dashed line from joint1 to cursor once joint1 is chosen ───
      case 'gear-joint1':
        break;
      case 'gear-joint2': {
        const anchors = getJointAnchorPoints(this.state.joint1);
        if (anchors.length > 0) {
          const cp1 = this.renderer.worldToCanvas(anchors[0]);
          ctx.beginPath(); ctx.setLineDash(PREVIEW_DASH);
          ctx.moveTo(cp1.x, cp1.y);
          ctx.lineTo(this.mouseCanvas.x, this.mouseCanvas.y);
          ctx.stroke(); ctx.setLineDash([]);
        }
        break;
      }
    }

    ctx.restore();
  }

  // ── Private: state helpers ──────────────────────────────────────────────────

  private initialPhase(tool: JointToolType): JointPhase {
    if (tool === 'revolute-joint' || tool === 'weld-joint' || tool === 'friction-joint')
      return { phase: 'awb-anchor', tool };
    if (tool === 'prismatic-joint' || tool === 'wheel-joint')
      return { phase: 'axis-anchor', tool };
    if (tool === 'distance-joint' || tool === 'rope-joint')
      return { phase: 'dr-anchorA', tool };
    if (tool === 'motor-joint')
      return { phase: 'motor-bodyA' };
    if (tool === 'pulley-joint')
      return { phase: 'pulley-anchorA' };
    return { phase: 'gear-joint1' };
  }

  // ── Private: snapping ───────────────────────────────────────────────────────

  private updateSnap(worldPos: planck.Vec2, ctrlKey: boolean): void {
    if (!ctrlKey) {
      this.isSnapped = false;
      return;
    }

    const maxDist = this.renderer.pixelsToWorldLength(SNAP_PIXELS);
    let best: planck.Vec2 | null = null;
    let bestDist = maxDist;

    for (let body = this.world.getBodyList(); body; body = body.getNext()) {
      const pos = body.getPosition();
      const d = worldDist(worldPos, pos);
      if (d < bestDist) { bestDist = d; best = pos; }

      for (let f = body.getFixtureList(); f; f = f.getNext()) {
        const shape = f.getShape();
        if (shape.getType() === 'polygon') {
          const s = shape as planck.PolygonShape;
          const count = (s as any).m_count as number;
          for (let i = 0; i < count; i++) {
            const v = body.getWorldPoint(s.m_vertices[i]);
            const d2 = worldDist(worldPos, v);
            if (d2 < bestDist) { bestDist = d2; best = v; }
          }
        } else if (shape.getType() === 'edge') {
          const s = shape as planck.EdgeShape;
          for (const lv of [s.m_vertex1, s.m_vertex2]) {
            const v = body.getWorldPoint(lv);
            const d2 = worldDist(worldPos, v);
            if (d2 < bestDist) { bestDist = d2; best = v; }
          }
        }
      }
    }

    if (best) {
      this.isSnapped = true;
      this.snapWorld = planck.Vec2(best.x, best.y);
    } else {
      this.isSnapped = false;
    }
  }

  // ── Private: hover hit-testing ─────────────────────────────────────────────

  private updateHover(worldPos: planck.Vec2, canvasPos: CP): void {
    const p = this.state.phase;

    const needsBodyHover =
      p === 'awb-bodyA'       || p === 'awb-bodyB'   ||
      p === 'axis-bodyA'      || p === 'axis-bodyB'  ||
      p === 'dr-anchorA'      || p === 'dr-anchorB'  ||
      p === 'motor-bodyA'     || p === 'motor-bodyB' ||
      p === 'pulley-anchorA'  || p === 'pulley-anchorB';
    // Note: axis-placed and axis-drag don't need body hover — user is setting axis, not picking bodies

    this.hoverBody  = needsBodyHover ? this.hitTestBody(worldPos) : null;
    this.hoverJoint = (p === 'gear-joint1' || p === 'gear-joint2')
      ? this.hitTestGearJoint(canvasPos)
      : null;
  }

  private hitTestBody(worldPos: planck.Vec2): planck.Body | null {
    const tol = this.renderer.pixelsToWorldLength(10);
    const aabb = planck.AABB(
      planck.Vec2(worldPos.x - tol, worldPos.y - tol),
      planck.Vec2(worldPos.x + tol, worldPos.y + tol),
    );
    let hit: planck.Body | null = null;
    this.world.queryAABB(aabb, (fixture) => {
      if (this.fixtureHit(fixture, worldPos, tol)) {
        hit = fixture.getBody();
        return false;
      }
      return true;
    });
    return hit;
  }

  private fixtureHit(fixture: planck.Fixture, worldPos: planck.Vec2, lineTol: number): boolean {
    const shape = fixture.getShape();
    const body  = fixture.getBody();
    const type  = shape.getType();

    if (type === 'circle' || type === 'polygon') return fixture.testPoint(worldPos);

    if (type === 'edge') {
      const s = shape as planck.EdgeShape;
      return ptSegDistSq(worldPos, body.getWorldPoint(s.m_vertex1), body.getWorldPoint(s.m_vertex2))
        <= lineTol * lineTol;
    }

    if (type === 'chain') {
      const s = shape as planck.ChainShape;
      for (let i = 0; i < s.m_vertices.length - 1; i++) {
        if (ptSegDistSq(worldPos, body.getWorldPoint(s.m_vertices[i]), body.getWorldPoint(s.m_vertices[i + 1]))
            <= lineTol * lineTol) return true;
      }
    }

    return false;
  }

  private hitTestGearJoint(canvasPos: CP): planck.RevoluteJoint | planck.PrismaticJoint | null {
    for (let j = this.world.getJointList(); j; j = j.getNext()) {
      const type = j.getType();
      if (type !== 'revolute-joint' && type !== 'prismatic-joint') continue;
      const anchors = getJointAnchorPoints(j);
      for (const wp of anchors) {
        const cp = this.renderer.worldToCanvas(wp);
        if (Math.hypot(cp.x - canvasPos.x, cp.y - canvasPos.y) <= GEAR_JOINT_HIT_PX) {
          return j as planck.RevoluteJoint | planck.PrismaticJoint;
        }
      }
    }
    return null;
  }

  // ── Private: axis direction ─────────────────────────────────────────────────

  /**
   * Compute a normalized world-space axis direction from the anchor to the mouse.
   * If shiftKey is true, snaps to nearest 45° increment.
   */
  private computeAxisDir(anchor: planck.Vec2, mouseWorld: planck.Vec2, shiftKey: boolean): planck.Vec2 {
    let dx = mouseWorld.x - anchor.x;
    let dy = mouseWorld.y - anchor.y;
    const len = Math.hypot(dx, dy);
    if (len < 1e-6) return planck.Vec2(1, 0);
    dx /= len; dy /= len;

    if (shiftKey) {
      const angle   = Math.atan2(dy, dx);
      const snapped = Math.round(angle / (Math.PI / 4)) * (Math.PI / 4);
      dx = Math.cos(snapped);
      dy = Math.sin(snapped);
    }

    return planck.Vec2(dx, dy);
  }

  // ── Private: drawing helpers ────────────────────────────────────────────────

  private drawDot(ctx: CanvasRenderingContext2D, cp: CP): void {
    ctx.beginPath();
    ctx.arc(cp.x, cp.y, PREVIEW_DOT_R, 0, Math.PI * 2);
    ctx.fillStyle = C_SNAP_DOT;
    ctx.fill();
  }

  /**
   * Draw a dashed axis arrow centered at the anchor, extending AXIS_HALF_PX in each direction.
   * The world-space axis direction is converted to canvas space via worldToCanvas so the
   * Y-axis flip is handled correctly.
   */
  private drawAxisPreview(ctx: CanvasRenderingContext2D, anchorWorld: planck.Vec2, axis: planck.Vec2): void {
    const cpAnchor = this.renderer.worldToCanvas(anchorWorld);

    // Convert axis direction to canvas space by transforming a point offset by the axis
    const cpDir = this.renderer.worldToCanvas(
      planck.Vec2(anchorWorld.x + axis.x, anchorWorld.y + axis.y),
    );
    const rawDx = cpDir.x - cpAnchor.x;
    const rawDy = cpDir.y - cpAnchor.y;
    const len   = Math.hypot(rawDx, rawDy) || 1;
    const nx    = rawDx / len;
    const ny    = rawDy / len;

    ctx.beginPath();
    ctx.setLineDash(PREVIEW_DASH);
    ctx.moveTo(cpAnchor.x - nx * AXIS_HALF_PX, cpAnchor.y - ny * AXIS_HALF_PX);
    ctx.lineTo(cpAnchor.x + nx * AXIS_HALF_PX, cpAnchor.y + ny * AXIS_HALF_PX);
    ctx.stroke();
    ctx.setLineDash([]);

    this.drawArrowhead(ctx,  nx,  ny, cpAnchor.x + nx * AXIS_HALF_PX, cpAnchor.y + ny * AXIS_HALF_PX);
    this.drawArrowhead(ctx, -nx, -ny, cpAnchor.x - nx * AXIS_HALF_PX, cpAnchor.y - ny * AXIS_HALF_PX);
  }

  private drawArrowhead(ctx: CanvasRenderingContext2D, nx: number, ny: number, tipX: number, tipY: number): void {
    const px = -ny, py = nx;
    const s  = ARROW_SIZE_PX;
    ctx.beginPath();
    ctx.moveTo(tipX, tipY);
    ctx.lineTo(tipX - nx * s + px * s * 0.45, tipY - ny * s + py * s * 0.45);
    ctx.moveTo(tipX, tipY);
    ctx.lineTo(tipX - nx * s - px * s * 0.45, tipY - ny * s - py * s * 0.45);
    ctx.stroke();
  }

  private drawBodyHighlight(ctx: CanvasRenderingContext2D, body: planck.Body, color: string): void {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth   = 3;
    ctx.setLineDash([]);

    for (let f = body.getFixtureList(); f; f = f.getNext()) {
      const shape = f.getShape();
      const type  = shape.getType();
      ctx.beginPath();

      if (type === 'circle') {
        const s  = shape as planck.CircleShape;
        const cp = this.renderer.worldToCanvas(body.getWorldPoint(s.getCenter()));
        const r  = this.renderer.worldLengthToPixels(s.getRadius());
        ctx.arc(cp.x, cp.y, r, 0, Math.PI * 2);

      } else if (type === 'polygon') {
        const s     = shape as planck.PolygonShape;
        const count = (s as any).m_count as number;
        if (count === 0) { continue; }
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
        ctx.moveTo(c1.x, c1.y); ctx.lineTo(c2.x, c2.y);

      } else if (type === 'chain') {
        const s     = shape as planck.ChainShape;
        const verts = s.m_vertices;
        if (verts.length === 0) { continue; }
        const first = this.renderer.worldToCanvas(body.getWorldPoint(verts[0]));
        ctx.moveTo(first.x, first.y);
        for (let i = 1; i < verts.length; i++) {
          const p = this.renderer.worldToCanvas(body.getWorldPoint(verts[i]));
          ctx.lineTo(p.x, p.y);
        }
      }

      ctx.stroke();
    }

    ctx.restore();
  }

  // ── Private: joint creation ─────────────────────────────────────────────────

  private createAWBJoint(tool: AWBTool, bodyA: planck.Body, bodyB: planck.Body, anchor: planck.Vec2): void {
    let joint: planck.Joint | null;
    if (tool === 'revolute-joint') {
      joint = this.world.createJoint(planck.RevoluteJoint({}, bodyA, bodyB, anchor));
    } else if (tool === 'weld-joint') {
      joint = this.world.createJoint(planck.WeldJoint({}, bodyA, bodyB, anchor));
    } else {
      joint = this.world.createJoint(planck.FrictionJoint({}, bodyA, bodyB, anchor));
    }
    if (joint) this.jointCreatedCallback?.(joint);
  }

  private createAxisJoint(tool: AxisTool, bodyA: planck.Body, bodyB: planck.Body, anchor: planck.Vec2, axis: planck.Vec2): void {
    let joint: planck.Joint | null;
    if (tool === 'prismatic-joint') {
      joint = this.world.createJoint(planck.PrismaticJoint({}, bodyA, bodyB, anchor, axis));
    } else {
      joint = this.world.createJoint(planck.WheelJoint({}, bodyA, bodyB, anchor, axis));
    }
    if (joint) this.jointCreatedCallback?.(joint);
  }

  private createDRJoint(
    tool: DRTool,
    bodyA: planck.Body, anchorA: planck.Vec2,
    bodyB: planck.Body, anchorB: planck.Vec2,
  ): void {
    let joint: planck.Joint | null;
    if (tool === 'distance-joint') {
      joint = this.world.createJoint(planck.DistanceJoint({}, bodyA, bodyB, anchorA, anchorB));
    } else {
      // RopeJoint needs local anchors; use the def form with bodyA/bodyB
      const ropeDef: planck.RopeJointDef = {
        bodyA,
        bodyB,
        localAnchorA: bodyA.getLocalPoint(anchorA),
        localAnchorB: bodyB.getLocalPoint(anchorB),
        maxLength:    worldDist(anchorA, anchorB),
      };
      joint = this.world.createJoint(new planck.RopeJoint(ropeDef));
    }
    if (joint) this.jointCreatedCallback?.(joint);
  }

  private createMotorJoint(bodyA: planck.Body, bodyB: planck.Body): void {
    const joint = this.world.createJoint(planck.MotorJoint({}, bodyA, bodyB));
    if (joint) this.jointCreatedCallback?.(joint);
  }

  private createPulleyJoint(
    bodyA: planck.Body, anchorA: planck.Vec2,
    bodyB: planck.Body, anchorB: planck.Vec2,
    groundA: planck.Vec2, groundB: planck.Vec2,
  ): void {
    const joint = this.world.createJoint(
      planck.PulleyJoint({}, bodyA, bodyB, groundA, groundB, anchorA, anchorB, 1),
    );
    if (joint) this.jointCreatedCallback?.(joint);
  }

  private createGearJoint(
    joint1: planck.RevoluteJoint | planck.PrismaticJoint,
    joint2: planck.RevoluteJoint | planck.PrismaticJoint,
  ): void {
    const bodyA = joint1.getBodyB();
    const bodyB = joint2.getBodyB();
    const joint = this.world.createJoint(
      planck.GearJoint({}, bodyA, bodyB, joint1, joint2, 1),
    );
    if (joint) this.jointCreatedCallback?.(joint);
  }

  // ── Private: status messages ────────────────────────────────────────────────

  private emitStatus(): void {
    if (!this.statusCallback) return;
    const msgs: Partial<Record<JointPhase['phase'], string>> = {
      'awb-anchor':       'Click to place joint anchor (hold Ctrl to snap to body center or edge)',
      'awb-bodyA':        'Click the first body to connect',
      'awb-bodyB':        'Click the second body to connect',
      'axis-anchor':      'Click to place joint anchor (hold Ctrl to snap to body center or edge)',
      'axis-placed':      'Drag to set the sliding axis (hold Shift to snap to 45° increments)',
      'axis-drag':        'Drag to set the sliding axis (hold Shift to snap to 45° increments)',
      'axis-bodyA':       'Click the first body to connect',
      'axis-bodyB':       'Click the second body to connect',
      'dr-anchorA':       'Click to place anchor on first body (hold Ctrl to snap to body center or edge)',
      'dr-anchorB':       'Click to place anchor on second body (hold Ctrl to snap to body center or edge)',
      'motor-bodyA':      'Click the first body',
      'motor-bodyB':      'Click the second body',
      'pulley-anchorA':   'Click to place anchor on first body (hold Ctrl to snap)',
      'pulley-anchorB':   'Click to place anchor on second body (hold Ctrl to snap)',
      'pulley-groundA':   'Click to place first pulley ground anchor (hold Ctrl to snap)',
      'pulley-groundB':   'Click to place second pulley ground anchor (hold Ctrl to snap)',
      'gear-joint1':      'Click the first joint to connect (RevoluteJoint or PrismaticJoint)',
      'gear-joint2':      'Click the second joint to connect (RevoluteJoint or PrismaticJoint)',
    };
    this.statusCallback(msgs[this.state.phase] ?? '');
  }
}

// ── Module-level geometry helpers ──────────────────────────────────────────────

function worldDist(a: planck.Vec2, b: planck.Vec2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function ptSegDistSq(p: planck.Vec2, a: planck.Vec2, b: planck.Vec2): number {
  const abx = b.x - a.x, aby = b.y - a.y;
  const lenSq = abx * abx + aby * aby;
  if (lenSq === 0) {
    const dx = p.x - a.x, dy = p.y - a.y;
    return dx * dx + dy * dy;
  }
  const t  = Math.max(0, Math.min(1, ((p.x - a.x) * abx + (p.y - a.y) * aby) / lenSq));
  const dx = p.x - (a.x + t * abx);
  const dy = p.y - (a.y + t * aby);
  return dx * dx + dy * dy;
}
