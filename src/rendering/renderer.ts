import * as planck from 'planck';
import { drawBodies, drawBodyNames } from './bodies';
import { drawJoints } from './joints';

// Initial pixels per meter — can be changed by zooming
const DEFAULT_PIXELS_PER_METER = 50;

// Zoom limits
const MIN_PIXELS_PER_METER = 5;
const MAX_PIXELS_PER_METER = 500;
const ZOOM_FACTOR = 1.1; // multiplier per scroll tick

// Canvas background color
const BACKGROUND_COLOR = '#1a1a2e';

export interface RenderSettings {
  showBodies: boolean;
  showJoints: boolean;
  showNames:  boolean;
}

export const DEFAULT_RENDER_SETTINGS: RenderSettings = {
  showBodies: true,
  showJoints: true,
  showNames:  true,
};

export class Renderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private settings: RenderSettings;

  // Camera state — all world-to-canvas math goes through these
  private pixelsPerMeter: number = DEFAULT_PIXELS_PER_METER;
  // Camera origin: the world point that maps to canvas center
  private cameraX: number = 0;
  private cameraY: number = 0;

  constructor(canvas: HTMLCanvasElement, settings: RenderSettings = DEFAULT_RENDER_SETTINGS) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not get 2D rendering context from canvas');
    this.ctx = ctx;
    this.settings = { ...settings };
  }

  /**
   * Convert a planck.js world coordinate to canvas pixel coordinates.
   * Y axis is flipped: physics Y increases upward, canvas Y increases downward.
   */
  worldToCanvas(worldPos: planck.Vec2): { x: number; y: number } {
    return {
      x: this.canvas.width / 2 + (worldPos.x - this.cameraX) * this.pixelsPerMeter,
      y: this.canvas.height / 2 - (worldPos.y - this.cameraY) * this.pixelsPerMeter,
    };
  }

  /**
   * Convert a canvas pixel coordinate to a planck.js world coordinate.
   */
  canvasToWorld(canvasX: number, canvasY: number): planck.Vec2 {
    return planck.Vec2(
      (canvasX - this.canvas.width / 2) / this.pixelsPerMeter + this.cameraX,
      -(canvasY - this.canvas.height / 2) / this.pixelsPerMeter + this.cameraY
    );
  }

  /** Convert a world-space length to pixels at the current zoom level. */
  worldLengthToPixels(length: number): number {
    return length * this.pixelsPerMeter;
  }

  /** Convert a pixel length to world-space units at the current zoom level. */
  pixelsToWorldLength(pixels: number): number {
    return pixels / this.pixelsPerMeter;
  }

  /**
   * Zoom in or out centered on a canvas point (e.g. the mouse position).
   * @param zoomIn true to zoom in, false to zoom out
   * @param canvasX canvas X coordinate to zoom toward
   * @param canvasY canvas Y coordinate to zoom toward
   */
  zoom(zoomIn: boolean, canvasX: number, canvasY: number): void {
    const factor = zoomIn ? ZOOM_FACTOR : 1 / ZOOM_FACTOR;
    const newPixelsPerMeter = Math.min(
      MAX_PIXELS_PER_METER,
      Math.max(MIN_PIXELS_PER_METER, this.pixelsPerMeter * factor)
    );

    // Adjust camera so the world point under the mouse stays fixed
    const worldUnderMouse = this.canvasToWorld(canvasX, canvasY);
    this.pixelsPerMeter = newPixelsPerMeter;
    const newCanvasPos = this.worldToCanvas(worldUnderMouse);
    this.cameraX += (newCanvasPos.x - canvasX) / this.pixelsPerMeter;
    this.cameraY -= (newCanvasPos.y - canvasY) / this.pixelsPerMeter;
  }

  /** Pan the camera by a delta in pixel space. */
  pan(deltaPixelsX: number, deltaPixelsY: number): void {
    this.cameraX -= deltaPixelsX / this.pixelsPerMeter;
    this.cameraY += deltaPixelsY / this.pixelsPerMeter;
  }

  /** Current zoom level in pixels per meter. */
  getPixelsPerMeter(): number {
    return this.pixelsPerMeter;
  }

  /** Clear the canvas and draw all world objects. */
  draw(world: planck.World, selectedJoint: planck.Joint | null = null): void {
    this.clear();

    this.ctx.save();

    if (this.settings.showBodies) {
      drawBodies(this.ctx, world, this);
    }

    if (this.settings.showJoints) {
      drawJoints(this.ctx, world, this, selectedJoint);
    }

    if (this.settings.showNames) {
      drawBodyNames(this.ctx, world, this);
    }

    this.ctx.restore();
  }

  private clear(): void {
    this.ctx.fillStyle = BACKGROUND_COLOR;
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
  }

  applySettings(settings: Partial<RenderSettings>): void {
    this.settings = { ...this.settings, ...settings };
  }

  getSettings(): RenderSettings {
    return { ...this.settings };
  }

  getContext(): CanvasRenderingContext2D {
    return this.ctx;
  }

  getCanvas(): HTMLCanvasElement {
    return this.canvas;
  }

  /** Return the visible world-space bounding box for the current camera and canvas size. */
  getVisibleWorldBounds(): { minX: number; minY: number; maxX: number; maxY: number } {
    const topLeft     = this.canvasToWorld(0, this.canvas.height);
    const bottomRight = this.canvasToWorld(this.canvas.width, 0);
    return {
      minX: topLeft.x,
      maxX: bottomRight.x,
      minY: topLeft.y,
      maxY: bottomRight.y,
    };
  }
}
