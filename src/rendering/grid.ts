import { Renderer } from './renderer';

// ── Grid visual style ─────────────────────────────────────────────────────────

const GRID_LINE_COLOR   = 'rgba(255, 255, 255, 0.07)';
const AXIS_LINE_COLOR   = 'rgba(255, 255, 255, 0.20)';   // origin axes slightly brighter
const GRID_LINE_WIDTH   = 1;

// ── Scale bar style (lower-left canvas overlay) ───────────────────────────────

const SCALE_BAR_MARGIN_X = 14;   // px from left edge
const SCALE_BAR_MARGIN_Y = 14;   // px from bottom edge
const SCALE_BAR_HEIGHT   = 6;    // px — tick cap height on each end
const SCALE_TEXT_FONT    = '11px monospace';
const SCALE_TEXT_COLOR   = 'rgba(200, 200, 220, 0.85)';
const SCALE_LINE_COLOR   = 'rgba(200, 200, 220, 0.70)';
const SCALE_LINE_WIDTH   = 1.5;

// ── Nice-number grid spacing ──────────────────────────────────────────────────

/**
 * Choose a grid spacing that produces roughly 8–12 lines across the canvas width.
 * Always returns a "nice" value: 1, 2, or 5 × 10^n metres.
 */
function niceGridSpacing(worldWidth: number): number {
  const raw       = worldWidth / 10;
  const magnitude = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm      = raw / magnitude;
  let factor: number;
  if      (norm < 1.5) factor = 1;
  else if (norm < 3.5) factor = 2;
  else if (norm < 7.5) factor = 5;
  else                 factor = 10;
  return factor * magnitude;
}

/** Format a world-space distance (metres) as a human-readable string. */
function formatSpacing(metres: number): string {
  if      (metres >= 1000)  return `${+(metres / 1000).toPrecision(3)} km`;
  else if (metres >= 1)     return `${+metres.toPrecision(3)} m`;
  else if (metres >= 0.01)  return `${+(metres * 100).toPrecision(3)} cm`;
  else                      return `${+(metres * 1000).toPrecision(3)} mm`;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Draw a world-aligned grid and a scale bar in the lower-left corner.
 * Call this BEFORE drawing bodies/joints so the grid sits behind everything.
 * The scale bar is drawn AFTER (call drawGridScale separately), so it sits on top.
 */
export function drawGrid(
  ctx: CanvasRenderingContext2D,
  renderer: Renderer,
): void {
  const canvas = renderer.getCanvas();
  const w = canvas.width;
  const h = canvas.height;

  // Visible world bounds
  const topLeft     = renderer.canvasToWorld(0, 0);
  const bottomRight = renderer.canvasToWorld(w, h);

  const worldWidth  = bottomRight.x - topLeft.x;
  const spacing     = niceGridSpacing(worldWidth);

  ctx.save();
  ctx.lineWidth = GRID_LINE_WIDTH;

  // ── Vertical lines ──────────────────────────────────────────────────────────

  const firstColI = Math.floor(topLeft.x / spacing);
  const lastColI  = Math.ceil(bottomRight.x / spacing);

  for (let i = firstColI; i <= lastColI; i++) {
    const cx = renderer.worldToCanvas({ x: i * spacing, y: 0 } as any).x;
    ctx.strokeStyle = i === 0 ? AXIS_LINE_COLOR : GRID_LINE_COLOR;
    ctx.beginPath();
    ctx.moveTo(cx, 0);
    ctx.lineTo(cx, h);
    ctx.stroke();
  }

  // ── Horizontal lines ────────────────────────────────────────────────────────
  // world Y increases upward; canvas Y increases downward
  const worldTop    = topLeft.y;       // highest world Y visible
  const worldBottom = bottomRight.y;   // lowest world Y visible (most negative)

  const firstRowI = Math.floor(worldBottom / spacing);
  const lastRowI  = Math.ceil(worldTop / spacing);

  for (let j = firstRowI; j <= lastRowI; j++) {
    const cy = renderer.worldToCanvas({ x: 0, y: j * spacing } as any).y;
    ctx.strokeStyle = j === 0 ? AXIS_LINE_COLOR : GRID_LINE_COLOR;
    ctx.beginPath();
    ctx.moveTo(0, cy);
    ctx.lineTo(w, cy);
    ctx.stroke();
  }

  ctx.restore();
}

/**
 * Draw a scale bar in the lower-left corner showing the current grid spacing.
 * Call this AFTER drawing bodies/joints so it sits on top.
 */
export function drawGridScale(
  ctx: CanvasRenderingContext2D,
  renderer: Renderer,
): void {
  const canvas = renderer.getCanvas();
  const w = canvas.width;
  const h = canvas.height;

  const worldWidth = renderer.canvasToWorld(w, 0).x - renderer.canvasToWorld(0, 0).x;
  const spacing    = niceGridSpacing(worldWidth);
  const barPx      = spacing * renderer.getPixelsPerMeter();

  const x1 = SCALE_BAR_MARGIN_X;
  const x2 = x1 + barPx;
  const y  = h - SCALE_BAR_MARGIN_Y;

  ctx.save();
  ctx.strokeStyle = SCALE_LINE_COLOR;
  ctx.lineWidth   = SCALE_LINE_WIDTH;

  // Horizontal bar
  ctx.beginPath();
  ctx.moveTo(x1, y);
  ctx.lineTo(x2, y);
  ctx.stroke();

  // Left cap
  ctx.beginPath();
  ctx.moveTo(x1, y - SCALE_BAR_HEIGHT / 2);
  ctx.lineTo(x1, y + SCALE_BAR_HEIGHT / 2);
  ctx.stroke();

  // Right cap
  ctx.beginPath();
  ctx.moveTo(x2, y - SCALE_BAR_HEIGHT / 2);
  ctx.lineTo(x2, y + SCALE_BAR_HEIGHT / 2);
  ctx.stroke();

  // Label centred above the bar
  ctx.fillStyle    = SCALE_TEXT_COLOR;
  ctx.font         = SCALE_TEXT_FONT;
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillText(formatSpacing(spacing), (x1 + x2) / 2, y - SCALE_BAR_HEIGHT / 2 - 2);

  ctx.restore();
}
