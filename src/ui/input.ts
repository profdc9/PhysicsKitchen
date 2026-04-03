import * as planck from 'planck';
import { Renderer } from '../rendering/renderer';
import { Toolbar, ToolType } from './toolbar';
import { StatusBar } from './statusbar';
import { SelectTool } from './selectTool';
import { JointTool, JointToolType } from './jointTool';
import { BodyUserData } from '../types/userData';

// Default physical properties for newly placed bodies
const DEFAULT_DENSITY = 1.0;
const DEFAULT_FRICTION = 0.3;
const DEFAULT_RESTITUTION = 0.3;

// Minimum drag distance in pixels before a circle/box/line is committed
const MIN_DRAG_PIXELS = 4;

// How close the cursor must be to the first polygon vertex (in pixels) to close it
const POLYGON_CLOSE_SNAP_PIXELS = 12;

// Maximum time between two clicks to count as a double-click (ms)
const DOUBLE_CLICK_MS = 300;

// Preview colors
const PREVIEW_STROKE = 'rgba(255, 255, 100, 0.8)';
const PREVIEW_VERTEX_FILL = 'rgba(255, 255, 100, 0.9)';
const PREVIEW_VERTEX_RADIUS_PX = 4;
const PREVIEW_LINE_WIDTH = 1.5;
const PREVIEW_DASH: number[] = [5, 4];

type CanvasPoint = { x: number; y: number };

type PlacementState =
  | { phase: 'idle' }
  | { phase: 'circle-dragging';  startWorld: planck.Vec2; startCanvas: CanvasPoint }
  | { phase: 'box-dragging';     startWorld: planck.Vec2; startCanvas: CanvasPoint }
  | { phase: 'line-dragging';    startWorld: planck.Vec2; startCanvas: CanvasPoint }
  | { phase: 'polygon-placing';  vertices: planck.Vec2[]; mouseCanvas: CanvasPoint }
  | { phase: 'segments-placing';    vertices: planck.Vec2[]; mouseCanvas: CanvasPoint; lastClickMs: number };

// Joint tool type names for routing
const JOINT_TOOLS = new Set<ToolType>([
  'revolute-joint', 'weld-joint', 'prismatic-joint', 'distance-joint',
  'rope-joint', 'pulley-joint', 'gear-joint', 'wheel-joint',
  'friction-joint', 'motor-joint',
]);

export class InputHandler {
  private canvas: HTMLCanvasElement;
  private world: planck.World;
  private renderer: Renderer;
  private toolbar: Toolbar;
  private statusBar: StatusBar;
  private state: PlacementState = { phase: 'idle' };
  private previewFn: (() => void) | null = null;
  private selectTool: SelectTool;
  private jointTool: JointTool;
  private onBeforeChange: (() => void) | null;

  // Stored so they can be removed in destroy()
  private boundMouseDown: (e: MouseEvent) => void;
  private boundMouseMove: (e: MouseEvent) => void;
  private boundMouseUp:   (e: MouseEvent) => void;
  private boundKeyDown:   (e: KeyboardEvent) => void;

  constructor(
    canvas: HTMLCanvasElement,
    world: planck.World,
    renderer: Renderer,
    toolbar: Toolbar,
    statusBar: StatusBar,
    isSimulationRunning: () => boolean,
    onBeforeChange: (() => void) | null = null
  ) {
    this.canvas = canvas;
    this.world = world;
    this.renderer = renderer;
    this.toolbar = toolbar;
    this.statusBar = statusBar;
    this.onBeforeChange = onBeforeChange;
    this.selectTool = new SelectTool(world, renderer, isSimulationRunning, onBeforeChange);
    this.jointTool  = new JointTool(world, renderer);
    this.jointTool.setOnBeforeChange(onBeforeChange);
    this.jointTool.onStatusChange((text) => this.statusBar.set(text));

    this.toolbar.onChange((tool) => this.onToolChanged(tool));
    this.onToolChanged(this.toolbar.getCurrentTool());

    this.boundMouseDown = (e) => this.onMouseDown(e);
    this.boundMouseMove = (e) => this.onMouseMove(e);
    this.boundMouseUp   = (e) => this.onMouseUp(e);
    this.boundKeyDown   = (e) => this.onKeyDown(e);

    canvas.addEventListener('mousedown', this.boundMouseDown);
    window.addEventListener('mousemove', this.boundMouseMove);
    window.addEventListener('mouseup',   this.boundMouseUp);
    window.addEventListener('keydown',   this.boundKeyDown);
  }

  /** Remove all event listeners. Call before replacing this handler with a new one. */
  destroy(): void {
    this.canvas.removeEventListener('mousedown', this.boundMouseDown);
    window.removeEventListener('mousemove', this.boundMouseMove);
    window.removeEventListener('mouseup',   this.boundMouseUp);
    window.removeEventListener('keydown',   this.boundKeyDown);
  }

  getSelectTool(): SelectTool {
    return this.selectTool;
  }

  getJointTool(): JointTool {
    return this.jointTool;
  }

  /** Called each frame by the render loop to draw selection highlights and placement previews. */
  drawPreview(): void {
    this.selectTool.drawSelection();
    this.jointTool.drawPreview();
    if (this.previewFn) this.previewFn();
  }

  private canvasPos(e: MouseEvent): CanvasPoint {
    const rect = this.canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  private onToolChanged(tool: ToolType): void {
    this.selectTool.deactivate();
    this.state = { phase: 'idle' };
    this.previewFn = null;

    if (JOINT_TOOLS.has(tool)) {
      this.jointTool.activate(tool as JointToolType);
    } else {
      this.jointTool.deactivate();
      this.updateStatusBar(tool);
    }
  }

  private updateStatusBar(tool: ToolType): void {
    switch (tool) {
      case 'select':   this.statusBar.set('Click a body or joint to select it'); break;
      case 'circle':   this.statusBar.set('Click to set center, drag to set radius'); break;
      case 'box':      this.statusBar.set('Click one corner, drag to opposite corner'); break;
      case 'line':     this.statusBar.set('Click start point, drag to end point'); break;
      case 'polygon':  this.statusBar.set('Click to place vertices. Click near first vertex or Enter to close. Backspace to undo last vertex'); break;
      case 'segments': this.statusBar.set('Click to place vertices. Double-click or Enter to finish. Backspace to undo last vertex'); break;
      default:         this.statusBar.set('');
    }
  }

  // ── Mouse down ────────────────────────────────────────────────────────────

  private onMouseDown(e: MouseEvent): void {
    if (e.button !== 0) return;
    const cp   = this.canvasPos(e);
    const wp   = this.renderer.canvasToWorld(cp.x, cp.y);
    const tool = this.toolbar.getCurrentTool();

    if (JOINT_TOOLS.has(tool)) {
      // Only consume the event if the joint tool actually used it (axis drag start).
      // For all other joint phases, onMouseDown is a no-op and returns false.
      if (this.jointTool.onMouseDown(wp, cp, e.ctrlKey)) return;
    }

    switch (tool) {
      case 'select':
        this.selectTool.onMouseDown(wp, cp);
        return;

      case 'circle':
        this.state = { phase: 'circle-dragging', startWorld: wp, startCanvas: cp };
        break;

      case 'box':
        this.state = { phase: 'box-dragging', startWorld: wp, startCanvas: cp };
        break;

      case 'line':
        this.state = { phase: 'line-dragging', startWorld: wp, startCanvas: cp };
        break;

      case 'polygon':
        this.handlePolygonClick(wp, cp);
        break;

      case 'segments':
        this.handleSegmentsClick(wp, cp);
        break;
    }
  }

  // ── Mouse move ────────────────────────────────────────────────────────────

  private onMouseMove(e: MouseEvent): void {
    const cp   = this.canvasPos(e);
    const wp   = this.renderer.canvasToWorld(cp.x, cp.y);
    const tool = this.toolbar.getCurrentTool();

    if (JOINT_TOOLS.has(tool)) {
      this.jointTool.onMouseMove(wp, cp, e.ctrlKey, e.shiftKey);
      return;
    }

    if (tool === 'select') {
      this.selectTool.onMouseMove(wp, cp, e.shiftKey);
      return;
    }

    switch (this.state.phase) {
      case 'circle-dragging':
        this.updateCirclePreview(cp);
        break;
      case 'box-dragging':
        this.updateBoxPreview(cp);
        break;
      case 'line-dragging':
        this.updateLinePreview(cp);
        break;
      case 'polygon-placing':
        this.state.mouseCanvas = cp;
        this.updatePolygonPreview();
        break;
      case 'segments-placing':
        this.state.mouseCanvas = cp;
        this.updateSegmentsPreview();
        break;
    }
  }

  // ── Mouse up ──────────────────────────────────────────────────────────────

  private onMouseUp(e: MouseEvent): void {
    if (e.button !== 0) return;
    const cp   = this.canvasPos(e);
    const wp   = this.renderer.canvasToWorld(cp.x, cp.y);
    const tool = this.toolbar.getCurrentTool();

    if (JOINT_TOOLS.has(tool)) {
      this.jointTool.onMouseUp(wp, cp, e.ctrlKey, e.shiftKey);
      return;
    }

    if (tool === 'select') {
      this.selectTool.onMouseUp();
      return;
    }

    if (this.state.phase === 'circle-dragging') {
      const dragPx = Math.hypot(cp.x - this.state.startCanvas.x, cp.y - this.state.startCanvas.y);
      if (dragPx >= MIN_DRAG_PIXELS) {
        this.placeCircle(this.state.startWorld, this.renderer.pixelsToWorldLength(dragPx));
      }
      this.state = { phase: 'idle' };
      this.previewFn = null;

    } else if (this.state.phase === 'box-dragging') {
      const dragPx = Math.hypot(cp.x - this.state.startCanvas.x, cp.y - this.state.startCanvas.y);
      if (dragPx >= MIN_DRAG_PIXELS) {
        this.placeBox(this.state.startWorld, wp);
      }
      this.state = { phase: 'idle' };
      this.previewFn = null;

    } else if (this.state.phase === 'line-dragging') {
      const dragPx = Math.hypot(cp.x - this.state.startCanvas.x, cp.y - this.state.startCanvas.y);
      if (dragPx >= MIN_DRAG_PIXELS) {
        this.placeLine(this.state.startWorld, wp);
      }
      this.state = { phase: 'idle' };
      this.previewFn = null;
    }
  }

  // ── Keyboard ──────────────────────────────────────────────────────────────

  private onKeyDown(e: KeyboardEvent): void {
    const tool = this.toolbar.getCurrentTool();

    if (JOINT_TOOLS.has(tool)) {
      this.jointTool.onKeyDown(e);
      return;
    }

    if (this.state.phase === 'polygon-placing') {
      if (e.key === 'Enter') {
        this.commitPolygon();
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        if (this.state.vertices.length > 0) {
          this.state.vertices.pop();
          this.updatePolygonPreview();
        }
      }

    } else if (this.state.phase === 'segments-placing') {
      if (e.key === 'Enter') {
        this.commitSegments();
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        if (this.state.vertices.length > 0) {
          this.state.vertices.pop();
          this.updateSegmentsPreview();
        }
      }

    } else if (this.toolbar.getCurrentTool() === 'select') {
      if ((e.key === 'Delete' || e.key === 'Backspace') && !this.isInputElementFocused()) {
        e.preventDefault();
        this.selectTool.deleteSelected();
      }
    }
  }

  /** Returns true when a text-entry element has focus, so Delete/Backspace are not intercepted. */
  private isInputElementFocused(): boolean {
    const el = document.activeElement;
    return el instanceof HTMLInputElement
        || el instanceof HTMLTextAreaElement
        || el instanceof HTMLSelectElement;
  }

  // ── Polygon logic ─────────────────────────────────────────────────────────

  private handlePolygonClick(wp: planck.Vec2, cp: CanvasPoint): void {
    if (this.state.phase !== 'polygon-placing') {
      // Start a new polygon with the first vertex
      this.state = { phase: 'polygon-placing', vertices: [wp], mouseCanvas: cp };
      this.updatePolygonPreview();
      return;
    }

    // Check if clicking near the first vertex to close
    if (this.state.vertices.length >= 3) {
      const firstCanvas = this.renderer.worldToCanvas(this.state.vertices[0]);
      const distToFirst = Math.hypot(cp.x - firstCanvas.x, cp.y - firstCanvas.y);
      if (distToFirst <= POLYGON_CLOSE_SNAP_PIXELS) {
        this.commitPolygon();
        return;
      }
    }

    this.state.vertices.push(wp);
    this.updatePolygonPreview();
  }

  private commitPolygon(): void {
    if (this.state.phase !== 'polygon-placing') return;
    if (this.state.vertices.length >= 3) {
      this.placePolygon(this.state.vertices);
    }
    this.state = { phase: 'idle' };
    this.previewFn = null;
  }

  private updatePolygonPreview(): void {
    if (this.state.phase !== 'polygon-placing') return;
    const vertices = this.state.vertices;
    const mouseCanvas = this.state.mouseCanvas;

    this.previewFn = () => {
      if (this.state.phase !== 'polygon-placing') return;
      const ctx = this.renderer.getContext();
      ctx.save();
      ctx.strokeStyle = PREVIEW_STROKE;
      ctx.lineWidth = PREVIEW_LINE_WIDTH;

      // Solid lines between placed vertices
      if (vertices.length >= 2) {
        ctx.beginPath();
        ctx.setLineDash([]);
        const first = this.renderer.worldToCanvas(vertices[0]);
        ctx.moveTo(first.x, first.y);
        for (let i = 1; i < vertices.length; i++) {
          const p = this.renderer.worldToCanvas(vertices[i]);
          ctx.lineTo(p.x, p.y);
        }
        ctx.stroke();
      }

      // Dashed line from last vertex to mouse
      if (vertices.length >= 1) {
        const last = this.renderer.worldToCanvas(vertices[vertices.length - 1]);
        ctx.beginPath();
        ctx.setLineDash(PREVIEW_DASH);
        ctx.moveTo(last.x, last.y);
        ctx.lineTo(mouseCanvas.x, mouseCanvas.y);
        ctx.stroke();

        // Dashed closing line from mouse back to first vertex
        if (vertices.length >= 2) {
          const first = this.renderer.worldToCanvas(vertices[0]);
          ctx.beginPath();
          ctx.moveTo(mouseCanvas.x, mouseCanvas.y);
          ctx.lineTo(first.x, first.y);
          ctx.stroke();
        }
      }

      // Draw vertex dots
      ctx.setLineDash([]);
      ctx.fillStyle = PREVIEW_VERTEX_FILL;
      for (const v of vertices) {
        const p = this.renderer.worldToCanvas(v);
        ctx.beginPath();
        ctx.arc(p.x, p.y, PREVIEW_VERTEX_RADIUS_PX, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();
    };
  }

  // ── Segments logic ────────────────────────────────────────────────────────

  private handleSegmentsClick(wp: planck.Vec2, cp: CanvasPoint): void {
    const now = Date.now();

    if (this.state.phase !== 'segments-placing') {
      this.state = { phase: 'segments-placing', vertices: [wp], mouseCanvas: cp, lastClickMs: now };
      this.updateSegmentsPreview();
      return;
    }

    // Double-click to finish
    if (now - this.state.lastClickMs <= DOUBLE_CLICK_MS) {
      this.commitSegments();
      return;
    }

    this.state.vertices.push(wp);
    this.state.lastClickMs = now;
    this.updateSegmentsPreview();
  }

  private commitSegments(): void {
    if (this.state.phase !== 'segments-placing') return;
    if (this.state.vertices.length >= 2) {
      this.placeSegments(this.state.vertices);
    }
    this.state = { phase: 'idle' };
    this.previewFn = null;
  }

  private updateSegmentsPreview(): void {
    if (this.state.phase !== 'segments-placing') return;
    const vertices = this.state.vertices;
    const mouseCanvas = this.state.mouseCanvas;

    this.previewFn = () => {
      if (this.state.phase !== 'segments-placing') return;
      const ctx = this.renderer.getContext();
      ctx.save();
      ctx.strokeStyle = PREVIEW_STROKE;
      ctx.lineWidth = PREVIEW_LINE_WIDTH;

      // Solid lines between placed vertices
      if (vertices.length >= 2) {
        ctx.beginPath();
        ctx.setLineDash([]);
        const first = this.renderer.worldToCanvas(vertices[0]);
        ctx.moveTo(first.x, first.y);
        for (let i = 1; i < vertices.length; i++) {
          const p = this.renderer.worldToCanvas(vertices[i]);
          ctx.lineTo(p.x, p.y);
        }
        ctx.stroke();
      }

      // Dashed line from last vertex to mouse
      if (vertices.length >= 1) {
        const last = this.renderer.worldToCanvas(vertices[vertices.length - 1]);
        ctx.beginPath();
        ctx.setLineDash(PREVIEW_DASH);
        ctx.moveTo(last.x, last.y);
        ctx.lineTo(mouseCanvas.x, mouseCanvas.y);
        ctx.stroke();
      }

      // Draw vertex dots
      ctx.setLineDash([]);
      ctx.fillStyle = PREVIEW_VERTEX_FILL;
      for (const v of vertices) {
        const p = this.renderer.worldToCanvas(v);
        ctx.beginPath();
        ctx.arc(p.x, p.y, PREVIEW_VERTEX_RADIUS_PX, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();
    };
  }

  // ── Preview updaters for drag tools ──────────────────────────────────────

  private updateCirclePreview(cp: CanvasPoint): void {
    if (this.state.phase !== 'circle-dragging') return;
    const centerCanvas = this.renderer.worldToCanvas(this.state.startWorld);
    const radiusPx = Math.hypot(cp.x - this.state.startCanvas.x, cp.y - this.state.startCanvas.y);

    this.previewFn = () => {
      const ctx = this.renderer.getContext();
      ctx.save();
      ctx.beginPath();
      ctx.arc(centerCanvas.x, centerCanvas.y, Math.max(radiusPx, 1), 0, Math.PI * 2);
      ctx.strokeStyle = PREVIEW_STROKE;
      ctx.lineWidth = PREVIEW_LINE_WIDTH;
      ctx.setLineDash(PREVIEW_DASH);
      ctx.stroke();
      ctx.restore();
    };
  }

  private updateBoxPreview(cp: CanvasPoint): void {
    if (this.state.phase !== 'box-dragging') return;
    const c1 = this.renderer.worldToCanvas(this.state.startWorld);

    this.previewFn = () => {
      const ctx = this.renderer.getContext();
      ctx.save();
      ctx.beginPath();
      ctx.rect(c1.x, c1.y, cp.x - c1.x, cp.y - c1.y);
      ctx.strokeStyle = PREVIEW_STROKE;
      ctx.lineWidth = PREVIEW_LINE_WIDTH;
      ctx.setLineDash(PREVIEW_DASH);
      ctx.stroke();
      ctx.restore();
    };
  }

  private updateLinePreview(cp: CanvasPoint): void {
    if (this.state.phase !== 'line-dragging') return;
    const c1 = this.renderer.worldToCanvas(this.state.startWorld);

    this.previewFn = () => {
      const ctx = this.renderer.getContext();
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(c1.x, c1.y);
      ctx.lineTo(cp.x, cp.y);
      ctx.strokeStyle = PREVIEW_STROKE;
      ctx.lineWidth = PREVIEW_LINE_WIDTH;
      ctx.setLineDash(PREVIEW_DASH);
      ctx.stroke();
      ctx.restore();
    };
  }

  // ── Shape placement ───────────────────────────────────────────────────────

  private placeCircle(center: planck.Vec2, radius: number): void {
    this.onBeforeChange?.();
    const body = this.world.createBody({ type: 'dynamic', position: center });
    body.createFixture({
      shape: new planck.CircleShape(radius),
      density: DEFAULT_DENSITY,
      friction: DEFAULT_FRICTION,
      restitution: DEFAULT_RESTITUTION,
    });
    body.setUserData({ shapeKind: 'circle' } satisfies BodyUserData);
  }

  private placeBox(cornerA: planck.Vec2, cornerB: planck.Vec2): void {
    this.onBeforeChange?.();
    const cx = (cornerA.x + cornerB.x) / 2;
    const cy = (cornerA.y + cornerB.y) / 2;
    const halfW = Math.abs(cornerB.x - cornerA.x) / 2;
    const halfH = Math.abs(cornerB.y - cornerA.y) / 2;
    const body = this.world.createBody({ type: 'dynamic', position: planck.Vec2(cx, cy) });
    body.createFixture({
      shape: new planck.BoxShape(halfW, halfH),
      density: DEFAULT_DENSITY,
      friction: DEFAULT_FRICTION,
      restitution: DEFAULT_RESTITUTION,
    });
    body.setUserData({ shapeKind: 'box' } satisfies BodyUserData);
  }

  private placeLine(v1: planck.Vec2, v2: planck.Vec2): void {
    this.onBeforeChange?.();
    const body = this.world.createBody({ type: 'static' });
    body.createFixture({
      shape: new planck.EdgeShape(v1, v2),
      friction: DEFAULT_FRICTION,
    });
    body.setUserData({ shapeKind: 'line' } satisfies BodyUserData);
  }

  private placePolygon(vertices: planck.Vec2[]): void {
    this.onBeforeChange?.();
    // Compute centroid to use as body origin
    const cx = vertices.reduce((s, v) => s + v.x, 0) / vertices.length;
    const cy = vertices.reduce((s, v) => s + v.y, 0) / vertices.length;
    const center = planck.Vec2(cx, cy);
    const localVerts = vertices.map(v => planck.Vec2(v.x - cx, v.y - cy));

    const body = this.world.createBody({ type: 'dynamic', position: center });
    body.createFixture({
      shape: new planck.PolygonShape(localVerts),
      density: DEFAULT_DENSITY,
      friction: DEFAULT_FRICTION,
      restitution: DEFAULT_RESTITUTION,
    });
    body.setUserData({ shapeKind: 'polygon' } satisfies BodyUserData);
  }

  private placeSegments(vertices: planck.Vec2[]): void {
    this.onBeforeChange?.();
    const body = this.world.createBody({ type: 'static' });
    body.createFixture({
      shape: new planck.ChainShape(vertices, false),
      friction: DEFAULT_FRICTION,
    });
    body.setUserData({ shapeKind: 'segments' } satisfies BodyUserData);
  }
}
