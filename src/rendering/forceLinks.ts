import * as planck from 'planck';
import { ForceLink } from '../physics/forceLinks';
import { Renderer } from './renderer';

// ── Visual constants ──────────────────────────────────────────────────────────

const LINK_COLOR          = 'rgba(200, 140, 255, 0.8)';   // purple
const LINK_SELECTED_COLOR = 'rgba(80, 220, 140, 0.9)';    // green — matches joint selection
const LINK_LINE_WIDTH     = 1.5;
const LINK_SELECTED_WIDTH = 2.5;
const LINK_DASH: number[] = [6, 4];

// Midpoint marker
const MARKER_LABEL  = 'ƒ';
const MARKER_RADIUS = 9;    // px — filled circle behind label
const MARKER_FONT   = '12px monospace';
const MARKER_BG     = '#1a1a2e';  // matches canvas background

// Hit-test radius in pixels for the midpoint marker
export const FORCE_LINK_HIT_PX = 12;

/**
 * Draw all force links as dashed lines with a midpoint "ƒ" marker.
 * The selected link is rendered in selection-green; others in purple.
 */
export function drawForceLinks(
  ctx: CanvasRenderingContext2D,
  forceLinks: ForceLink[],
  renderer: Renderer,
  selectedLink: ForceLink | null,
): void {
  for (const fl of forceLinks) {
    const cpA = renderer.worldToCanvas(fl.bodyA.getPosition());
    const cpB = renderer.worldToCanvas(fl.bodyB.getPosition());
    const isSelected = fl === selectedLink;
    const color = isSelected ? LINK_SELECTED_COLOR : LINK_COLOR;

    ctx.save();

    // Dashed line between body centroids
    ctx.strokeStyle = color;
    ctx.lineWidth = isSelected ? LINK_SELECTED_WIDTH : LINK_LINE_WIDTH;
    ctx.setLineDash(LINK_DASH);
    ctx.beginPath();
    ctx.moveTo(cpA.x, cpA.y);
    ctx.lineTo(cpB.x, cpB.y);
    ctx.stroke();

    // Midpoint marker: filled circle + "ƒ" label
    const mx = (cpA.x + cpB.x) / 2;
    const my = (cpA.y + cpB.y) / 2;

    ctx.setLineDash([]);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(mx, my, MARKER_RADIUS, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = MARKER_BG;
    ctx.font = MARKER_FONT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(MARKER_LABEL, mx, my);

    ctx.restore();
  }
}

/**
 * Hit-test a canvas point against force-link midpoint markers.
 * Returns the first ForceLink whose midpoint marker is within FORCE_LINK_HIT_PX,
 * or null if none match.
 */
export function hitTestForceLink(
  canvasPt: { x: number; y: number },
  forceLinks: ForceLink[],
  renderer: Renderer,
): ForceLink | null {
  for (const fl of forceLinks) {
    const cpA = renderer.worldToCanvas(fl.bodyA.getPosition());
    const cpB = renderer.worldToCanvas(fl.bodyB.getPosition());
    const mx = (cpA.x + cpB.x) / 2;
    const my = (cpA.y + cpB.y) / 2;
    if (Math.hypot(canvasPt.x - mx, canvasPt.y - my) <= FORCE_LINK_HIT_PX) {
      return fl;
    }
  }
  return null;
}
