import * as planck from 'planck';
import { Renderer } from '../rendering/renderer';
import { Toolbar, ToolType } from './toolbar';
import { StatusBar } from './statusbar';

// Default physical properties for newly placed bodies
const DEFAULT_DENSITY = 1.0;
const DEFAULT_FRICTION = 0.3;
const DEFAULT_RESTITUTION = 0.3;

// Minimum drag distance in pixels before a circle/box is committed
const MIN_DRAG_PIXELS = 4;

type PlacementState =
  | { phase: 'idle' }
  | { phase: 'circle-dragging'; startWorld: planck.Vec2; startCanvas: { x: number; y: number } }
  | { phase: 'box-dragging'; startWorld: planck.Vec2; startCanvas: { x: number; y: number } };

export class InputHandler {
  private canvas: HTMLCanvasElement;
  private world: planck.World;
  private renderer: Renderer;
  private toolbar: Toolbar;
  private statusBar: StatusBar;
  private state: PlacementState = { phase: 'idle' };

  // Preview canvas overlay drawn each frame by the render loop
  private previewFn: (() => void) | null = null;

  constructor(
    canvas: HTMLCanvasElement,
    world: planck.World,
    renderer: Renderer,
    toolbar: Toolbar,
    statusBar: StatusBar
  ) {
    this.canvas = canvas;
    this.world = world;
    this.renderer = renderer;
    this.toolbar = toolbar;
    this.statusBar = statusBar;

    this.toolbar.onChange((tool) => this.onToolChanged(tool));
    this.onToolChanged(this.toolbar.getCurrentTool());

    canvas.addEventListener('mousedown', (e) => this.onMouseDown(e));
    canvas.addEventListener('mousemove', (e) => this.onMouseMove(e));
    canvas.addEventListener('mouseup',   (e) => this.onMouseUp(e));
  }

  /** Called each frame by the render loop to draw in-progress placement previews. */
  drawPreview(): void {
    if (this.previewFn) this.previewFn();
  }

  private canvasPos(e: MouseEvent): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  private onToolChanged(tool: ToolType): void {
    this.state = { phase: 'idle' };
    this.previewFn = null;
    this.updateStatusBar(tool);
  }

  private updateStatusBar(tool: ToolType): void {
    switch (tool) {
      case 'select':   this.statusBar.set('Click a body or joint to select it'); break;
      case 'circle':   this.statusBar.set('Click to set center, drag to set radius'); break;
      case 'box':      this.statusBar.set('Click one corner, drag to opposite corner'); break;
      case 'polygon':  this.statusBar.set('Click to place vertices. Enter or click near first vertex to close. Backspace to undo last vertex'); break;
      case 'edge':     this.statusBar.set('Click start point, drag to end point'); break;
      case 'chain':    this.statusBar.set('Click to place vertices. Enter or double-click to finish. Backspace to undo last vertex'); break;
      default:         this.statusBar.set('');
    }
  }

  private onMouseDown(e: MouseEvent): void {
    if (e.button !== 0) return; // left click only
    const canvas = this.canvasPos(e);
    const world = this.renderer.canvasToWorld(canvas.x, canvas.y);
    const tool = this.toolbar.getCurrentTool();

    if (tool === 'circle') {
      this.state = { phase: 'circle-dragging', startWorld: world, startCanvas: canvas };
    } else if (tool === 'box') {
      this.state = { phase: 'box-dragging', startWorld: world, startCanvas: canvas };
    }
  }

  private onMouseMove(e: MouseEvent): void {
    const canvas = this.canvasPos(e);
    const world = this.renderer.canvasToWorld(canvas.x, canvas.y);

    if (this.state.phase === 'circle-dragging') {
      const start = this.state.startWorld;
      const radiusPx = Math.hypot(canvas.x - this.state.startCanvas.x, canvas.y - this.state.startCanvas.y);
      const radiusWorld = this.renderer.pixelsToWorldLength(radiusPx);
      const centerCanvas = this.renderer.worldToCanvas(start);

      this.previewFn = () => {
        const ctx = this.renderer.getContext();
        ctx.save();
        ctx.beginPath();
        ctx.arc(centerCanvas.x, centerCanvas.y, Math.max(radiusPx, 1), 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255, 255, 100, 0.8)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([5, 4]);
        ctx.stroke();
        ctx.restore();
      };

    } else if (this.state.phase === 'box-dragging') {
      const c1 = this.renderer.worldToCanvas(this.state.startWorld);
      const c2 = canvas;

      this.previewFn = () => {
        const ctx = this.renderer.getContext();
        ctx.save();
        ctx.beginPath();
        ctx.rect(c1.x, c1.y, c2.x - c1.x, c2.y - c1.y);
        ctx.strokeStyle = 'rgba(255, 255, 100, 0.8)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([5, 4]);
        ctx.stroke();
        ctx.restore();
      };
    }
  }

  private onMouseUp(e: MouseEvent): void {
    if (e.button !== 0) return;
    const canvas = this.canvasPos(e);
    const world = this.renderer.canvasToWorld(canvas.x, canvas.y);

    if (this.state.phase === 'circle-dragging') {
      const dragPx = Math.hypot(canvas.x - this.state.startCanvas.x, canvas.y - this.state.startCanvas.y);
      if (dragPx >= MIN_DRAG_PIXELS) {
        const radius = this.renderer.pixelsToWorldLength(dragPx);
        this.placeCircle(this.state.startWorld, radius);
      }
      this.state = { phase: 'idle' };
      this.previewFn = null;

    } else if (this.state.phase === 'box-dragging') {
      const dragPx = Math.hypot(canvas.x - this.state.startCanvas.x, canvas.y - this.state.startCanvas.y);
      if (dragPx >= MIN_DRAG_PIXELS) {
        this.placeBox(this.state.startWorld, world);
      }
      this.state = { phase: 'idle' };
      this.previewFn = null;
    }
  }

  private placeCircle(center: planck.Vec2, radius: number): void {
    const body = this.world.createBody({ type: 'dynamic', position: center });
    body.createFixture({
      shape: new planck.CircleShape(radius),
      density: DEFAULT_DENSITY,
      friction: DEFAULT_FRICTION,
      restitution: DEFAULT_RESTITUTION,
    });
  }

  private placeBox(cornerA: planck.Vec2, cornerB: planck.Vec2): void {
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
  }
}
