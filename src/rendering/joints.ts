import * as planck from 'planck';
import { Renderer } from './renderer';

// ── Visual constants (all pixel measurements) ─────────────────────────────────

const JOINT_LINE_WIDTH    = 1.5;
const ANCHOR_RADIUS_PX    = 5;        // visual radius of anchor handle dot
export const ANCHOR_HIT_PX = 10;     // hit-test radius — exported for SelectTool
const SYMBOL_R            = 8;        // revolute / friction / motor symbol radius
const SPRING_COILS        = 4;        // full zigzag periods for spring joints
const SPRING_AMP_PX       = 5;        // amplitude of spring zigzag in pixels
const AXIS_LEN_PX         = 32;       // half-length of prismatic/wheel axis line
const AXIS_HEAD_PX        = 7;        // arrowhead size
const PULLEY_WHEEL_PX     = 5;        // ground-anchor pulley wheel radius

// ── Colors ────────────────────────────────────────────────────────────────────

const C_JOINT    = 'rgba(130, 190, 255, 0.85)';   // blue-ish joint lines
const C_ANCHOR   = 'rgba(255, 200, 60, 0.90)';    // yellow anchor handle
const C_SELECTED = 'rgba(80, 255, 160, 1.00)';    // green when selected
const C_OUTLINE  = 'rgba(0, 0, 0, 0.45)';         // subtle dot outline

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Draw all joint symbols and anchor handles for every non-MouseJoint in the world.
 * selectedJoint is drawn in green; all others in blue/yellow.
 */
export function drawJoints(
  ctx: CanvasRenderingContext2D,
  world: planck.World,
  renderer: Renderer,
  selectedJoint: planck.Joint | null = null
): void {
  for (let j = world.getJointList(); j; j = j.getNext()) {
    if (j.getType() === 'mouse-joint') continue;
    drawOneJoint(ctx, j, renderer, j === selectedJoint);
  }
}

/**
 * Returns the world-space anchor positions for a joint that should be used as
 * click targets for selection.  Exported so SelectTool can hit-test them.
 */
export function getJointAnchorPoints(joint: planck.Joint): planck.Vec2[] {
  const type = joint.getType();
  const a    = joint.getAnchorA();
  const b    = joint.getAnchorB();

  if (type === 'pulley-joint') {
    const pj = joint as planck.PulleyJoint;
    return [a, b, pj.getGroundAnchorA(), pj.getGroundAnchorB()];
  }

  if (type === 'gear-joint') {
    // Use midpoint between the two linked joints' anchor-A positions as the click target
    const gj = joint as planck.GearJoint;
    const j1a = gj.getJoint1().getAnchorA();
    const j2a = gj.getJoint2().getAnchorA();
    return [planck.Vec2((j1a.x + j2a.x) / 2, (j1a.y + j2a.y) / 2)];
  }

  // For joints with a single shared anchor (revolute, weld, prismatic, etc.)
  // getAnchorA() and getAnchorB() are both at the same world point.
  // For two-anchor joints (distance, rope, wheel, motor) they may differ.
  const samePoint = (p1: planck.Vec2, p2: planck.Vec2) =>
    (p1.x - p2.x) ** 2 + (p1.y - p2.y) ** 2 < 0.0001;

  return samePoint(a, b) ? [a] : [a, b];
}

// ── Per-joint drawing ─────────────────────────────────────────────────────────

function drawOneJoint(
  ctx: CanvasRenderingContext2D,
  joint: planck.Joint,
  renderer: Renderer,
  selected: boolean
): void {
  const type = joint.getType();
  const cpA  = renderer.worldToCanvas(joint.getAnchorA());
  const cpB  = renderer.worldToCanvas(joint.getAnchorB());
  const col  = selected ? C_SELECTED : C_JOINT;

  ctx.save();
  ctx.strokeStyle = col;
  ctx.fillStyle   = col;
  ctx.lineWidth   = JOINT_LINE_WIDTH;
  ctx.setLineDash([]);

  switch (type) {
    case 'revolute-joint':  drawRevolute(ctx, cpA, col);                                         break;
    case 'weld-joint':      drawWeld(ctx, cpA, col);                                             break;
    case 'friction-joint':  drawFriction(ctx, cpA, col);                                         break;
    case 'motor-joint':     drawMotor(ctx, cpA, col);                                            break;
    case 'prismatic-joint': drawPrismatic(ctx, joint as planck.PrismaticJoint, cpA, col, renderer); break;
    case 'wheel-joint':     drawWheel(ctx, joint as planck.WheelJoint, cpA, cpB, col, renderer); break;
    case 'distance-joint':  drawDistance(ctx, joint as planck.DistanceJoint, cpA, cpB, col);    break;
    case 'rope-joint':      drawRope(ctx, cpA, cpB, col);                                        break;
    case 'pulley-joint':    drawPulley(ctx, joint as planck.PulleyJoint, cpA, cpB, col, renderer); break;
    case 'gear-joint':      drawGear(ctx, joint as planck.GearJoint, col, renderer);             break;
  }

  // Draw anchor handle dots on top of the symbol
  for (const wp of getJointAnchorPoints(joint)) {
    drawAnchorDot(ctx, renderer.worldToCanvas(wp), selected);
  }

  ctx.restore();
}

// ── Symbol drawing ────────────────────────────────────────────────────────────

/** ⊕ Circle with crosshair */
function drawRevolute(ctx: CanvasRenderingContext2D, cp: { x: number; y: number }, col: string): void {
  const r = SYMBOL_R;
  ctx.beginPath();
  ctx.arc(cp.x, cp.y, r, 0, Math.PI * 2);
  ctx.strokeStyle = col;
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cp.x - r, cp.y); ctx.lineTo(cp.x + r, cp.y);
  ctx.moveTo(cp.x, cp.y - r); ctx.lineTo(cp.x, cp.y + r);
  ctx.stroke();
}

/** ✕ Thick diagonal X */
function drawWeld(ctx: CanvasRenderingContext2D, cp: { x: number; y: number }, col: string): void {
  const r = SYMBOL_R * 0.75;
  ctx.beginPath();
  ctx.moveTo(cp.x - r, cp.y - r); ctx.lineTo(cp.x + r, cp.y + r);
  ctx.moveTo(cp.x + r, cp.y - r); ctx.lineTo(cp.x - r, cp.y + r);
  ctx.strokeStyle = col;
  ctx.lineWidth = 2.5;
  ctx.stroke();
}

/** ✦ Four radial spokes */
function drawFriction(ctx: CanvasRenderingContext2D, cp: { x: number; y: number }, col: string): void {
  const r = SYMBOL_R, ri = SYMBOL_R * 0.35;
  ctx.beginPath();
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 - Math.PI / 4;
    ctx.moveTo(cp.x + Math.cos(a) * ri, cp.y + Math.sin(a) * ri);
    ctx.lineTo(cp.x + Math.cos(a) * r,  cp.y + Math.sin(a) * r);
  }
  ctx.strokeStyle = col;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cp.x, cp.y, ri, 0, Math.PI * 2);
  ctx.stroke();
}

/** ↻ Curved arc with arrowhead */
function drawMotor(ctx: CanvasRenderingContext2D, cp: { x: number; y: number }, col: string): void {
  const r = SYMBOL_R;
  ctx.beginPath();
  ctx.arc(cp.x, cp.y, r, -Math.PI * 0.75, Math.PI * 0.5);
  ctx.strokeStyle = col;
  ctx.stroke();
  // Arrowhead at arc end (angle = π/2 → tip points right+down)
  const tipA = Math.PI * 0.5;
  const tx = cp.x + Math.cos(tipA) * r, ty = cp.y + Math.sin(tipA) * r;
  ctx.beginPath();
  ctx.moveTo(tx, ty);
  ctx.lineTo(tx - 5, ty - 3);
  ctx.moveTo(tx, ty);
  ctx.lineTo(tx + 3, ty - 5);
  ctx.stroke();
}

/**
 * ⇔ Dashed axis line with arrowheads + small rectangle at anchor.
 * The axis direction is taken from the joint's local X axis rotated by bodyA's angle.
 */
function drawPrismatic(
  ctx: CanvasRenderingContext2D,
  joint: planck.PrismaticJoint,
  cpA: { x: number; y: number },
  col: string,
  renderer: Renderer
): void {
  // Get axis in world space: rotate local X axis by bodyA's current angle
  const bodyA     = joint.getBodyA();
  const localAxis = (joint as any).m_localXAxisA as planck.Vec2 | undefined ?? planck.Vec2(1, 0);
  const worldAxis = bodyA.getWorldVector(localAxis);

  // Convert world-axis direction to canvas direction (Y is flipped)
  const cpAx = renderer.worldToCanvas(
    planck.Vec2(joint.getAnchorA().x + worldAxis.x, joint.getAnchorA().y + worldAxis.y)
  );
  const dx = cpAx.x - cpA.x, dy = cpAx.y - cpA.y;
  const len = Math.hypot(dx, dy) || 1;
  const nx = dx / len, ny = dy / len;

  ctx.setLineDash([4, 3]);
  ctx.beginPath();
  ctx.moveTo(cpA.x - nx * AXIS_LEN_PX, cpA.y - ny * AXIS_LEN_PX);
  ctx.lineTo(cpA.x + nx * AXIS_LEN_PX, cpA.y + ny * AXIS_LEN_PX);
  ctx.strokeStyle = col;
  ctx.stroke();
  ctx.setLineDash([]);

  drawArrowhead(ctx, cpA.x + nx * AXIS_LEN_PX, cpA.y + ny * AXIS_LEN_PX,  nx,  ny, AXIS_HEAD_PX, col);
  drawArrowhead(ctx, cpA.x - nx * AXIS_LEN_PX, cpA.y - ny * AXIS_LEN_PX, -nx, -ny, AXIS_HEAD_PX, col);

  // Small rectangle at anchor
  ctx.save();
  ctx.translate(cpA.x, cpA.y);
  ctx.rotate(Math.atan2(ny, nx));
  ctx.strokeStyle = col;
  ctx.beginPath();
  ctx.rect(-7, -4, 14, 8);
  ctx.stroke();
  ctx.restore();
}

/** Circle (wheel) at anchorB with spring line from anchorA to anchorB */
function drawWheel(
  ctx: CanvasRenderingContext2D,
  joint: planck.WheelJoint,
  cpA: { x: number; y: number },
  cpB: { x: number; y: number },
  col: string,
  renderer: Renderer
): void {
  drawSpringLine(ctx, cpA, cpB, col);
  ctx.beginPath();
  ctx.arc(cpB.x, cpB.y, SYMBOL_R, 0, Math.PI * 2);
  ctx.strokeStyle = col;
  ctx.stroke();
}

/** Solid rod (rigid) or zigzag spring between two anchors */
function drawDistance(
  ctx: CanvasRenderingContext2D,
  joint: planck.DistanceJoint,
  cpA: { x: number; y: number },
  cpB: { x: number; y: number },
  col: string
): void {
  const freqHz: number = (joint as any).m_frequencyHz ?? 0;
  ctx.strokeStyle = col;
  if (freqHz > 0) {
    drawSpringLine(ctx, cpA, cpB, col);
  } else {
    ctx.beginPath();
    ctx.moveTo(cpA.x, cpA.y);
    ctx.lineTo(cpB.x, cpB.y);
    ctx.stroke();
  }
}

/** Dashed rope between anchors */
function drawRope(
  ctx: CanvasRenderingContext2D,
  cpA: { x: number; y: number },
  cpB: { x: number; y: number },
  col: string
): void {
  ctx.beginPath();
  ctx.moveTo(cpA.x, cpA.y);
  ctx.lineTo(cpB.x, cpB.y);
  ctx.strokeStyle = col;
  ctx.setLineDash([5, 3]);
  ctx.stroke();
  ctx.setLineDash([]);
}

/** Lines from body anchors to ground anchors, horizontal bar with pulley wheels */
function drawPulley(
  ctx: CanvasRenderingContext2D,
  joint: planck.PulleyJoint,
  cpA: { x: number; y: number },
  cpB: { x: number; y: number },
  col: string,
  renderer: Renderer
): void {
  const gaA = renderer.worldToCanvas(joint.getGroundAnchorA());
  const gaB = renderer.worldToCanvas(joint.getGroundAnchorB());

  ctx.beginPath();
  ctx.strokeStyle = col;
  ctx.moveTo(cpA.x, cpA.y); ctx.lineTo(gaA.x, gaA.y);
  ctx.moveTo(cpB.x, cpB.y); ctx.lineTo(gaB.x, gaB.y);
  ctx.moveTo(gaA.x, gaA.y); ctx.lineTo(gaB.x, gaB.y);
  ctx.stroke();

  // Pulley wheels at ground anchors
  for (const ga of [gaA, gaB]) {
    ctx.beginPath();
    ctx.arc(ga.x, ga.y, PULLEY_WHEEL_PX, 0, Math.PI * 2);
    ctx.stroke();
  }
}

/** Dashed line between linked joint anchors with a gear icon at midpoint */
function drawGear(
  ctx: CanvasRenderingContext2D,
  joint: planck.GearJoint,
  col: string,
  renderer: Renderer
): void {
  const cp1 = renderer.worldToCanvas(joint.getJoint1().getAnchorA());
  const cp2 = renderer.worldToCanvas(joint.getJoint2().getAnchorA());

  ctx.beginPath();
  ctx.moveTo(cp1.x, cp1.y);
  ctx.lineTo(cp2.x, cp2.y);
  ctx.strokeStyle = col;
  ctx.setLineDash([4, 3]);
  ctx.stroke();
  ctx.setLineDash([]);

  drawGearIcon(ctx, (cp1.x + cp2.x) / 2, (cp1.y + cp2.y) / 2, col);
}

// ── Shared drawing utilities ──────────────────────────────────────────────────

export function drawAnchorDot(
  ctx: CanvasRenderingContext2D,
  cp: { x: number; y: number },
  selected: boolean
): void {
  ctx.beginPath();
  ctx.arc(cp.x, cp.y, ANCHOR_RADIUS_PX, 0, Math.PI * 2);
  ctx.fillStyle   = selected ? C_SELECTED : C_ANCHOR;
  ctx.strokeStyle = C_OUTLINE;
  ctx.lineWidth   = 1;
  ctx.fill();
  ctx.stroke();
}

function drawArrowhead(
  ctx: CanvasRenderingContext2D,
  x: number, y: number,
  nx: number, ny: number,
  size: number,
  col: string
): void {
  const px = -ny, py = nx; // perpendicular
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x - nx * size + px * size * 0.45, y - ny * size + py * size * 0.45);
  ctx.moveTo(x, y);
  ctx.lineTo(x - nx * size - px * size * 0.45, y - ny * size - py * size * 0.45);
  ctx.strokeStyle = col;
  ctx.stroke();
}

function drawSpringLine(
  ctx: CanvasRenderingContext2D,
  cpA: { x: number; y: number },
  cpB: { x: number; y: number },
  col: string
): void {
  const dx = cpB.x - cpA.x, dy = cpB.y - cpA.y;
  const len = Math.hypot(dx, dy);
  if (len < 2) return;

  const nx = dx / len, ny = dy / len;   // along
  const px = -ny, py = nx;             // perpendicular

  const pad    = len * 0.1;
  const zigLen = len - pad * 2;
  const steps  = SPRING_COILS * 2;
  const amp    = SPRING_AMP_PX;

  ctx.beginPath();
  ctx.moveTo(cpA.x, cpA.y);
  ctx.lineTo(cpA.x + nx * pad, cpA.y + ny * pad);

  for (let i = 0; i <= steps; i++) {
    const t    = i / steps;
    const pos  = pad + t * zigLen;
    const side = (i % 2 === 0 ? 1 : -1) * amp;
    ctx.lineTo(cpA.x + nx * pos + px * side, cpA.y + ny * pos + py * side);
  }

  ctx.lineTo(cpB.x, cpB.y);
  ctx.strokeStyle = col;
  ctx.setLineDash([]);
  ctx.stroke();
}

function drawGearIcon(ctx: CanvasRenderingContext2D, cx: number, cy: number, col: string): void {
  const outerR = 8, innerR = 5, teeth = 6;
  ctx.beginPath();
  for (let i = 0; i < teeth * 2; i++) {
    const a = (i / (teeth * 2)) * Math.PI * 2;
    const r = i % 2 === 0 ? outerR : innerR;
    const x = cx + Math.cos(a) * r;
    const y = cy + Math.sin(a) * r;
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.strokeStyle = col;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, innerR * 0.45, 0, Math.PI * 2);
  ctx.stroke();
}
