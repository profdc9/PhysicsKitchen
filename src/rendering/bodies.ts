import * as planck from 'planck';
import { Renderer } from './renderer';

// Colors for each body type
const COLOR_DYNAMIC = '#e0e0ff';
const COLOR_STATIC = '#80c080';
const COLOR_KINEMATIC = '#c0a0e0';
const COLOR_STROKE = '#ffffff';
const STROKE_WIDTH = 1.5;

export function drawBodies(
  ctx: CanvasRenderingContext2D,
  world: planck.World,
  renderer: Renderer
): void {
  for (let body = world.getBodyList(); body; body = body.getNext()) {
    drawBody(ctx, body, renderer);
  }
}

function drawBody(
  ctx: CanvasRenderingContext2D,
  body: planck.Body,
  renderer: Renderer
): void {
  const fillColor = getBodyColor(body);

  for (let fixture = body.getFixtureList(); fixture; fixture = fixture.getNext()) {
    drawFixture(ctx, body, fixture, fillColor, renderer);
  }
}

function drawFixture(
  ctx: CanvasRenderingContext2D,
  body: planck.Body,
  fixture: planck.Fixture,
  fillColor: string,
  renderer: Renderer
): void {
  const shape = fixture.getShape();
  const shapeType = shape.getType();

  ctx.beginPath();

  if (shapeType === 'circle') {
    drawCircleShape(ctx, body, shape as planck.CircleShape, renderer);
  } else if (shapeType === 'polygon') {
    drawPolygonShape(ctx, body, shape as planck.PolygonShape, renderer);
  } else if (shapeType === 'edge') {
    drawEdgeShape(ctx, body, shape as planck.EdgeShape, renderer);
  } else if (shapeType === 'chain') {
    drawChainShape(ctx, body, shape as planck.ChainShape, renderer);
  }

  // Edge and chain shapes have no fill — they are open line shapes
  if (shapeType !== 'edge' && shapeType !== 'chain') {
    ctx.fillStyle = fillColor;
    ctx.fill();
  }

  ctx.strokeStyle = COLOR_STROKE;
  ctx.lineWidth = STROKE_WIDTH;
  ctx.stroke();
}

function drawCircleShape(
  ctx: CanvasRenderingContext2D,
  body: planck.Body,
  shape: planck.CircleShape,
  renderer: Renderer
): void {
  const center = body.getWorldPoint(shape.getCenter());
  const canvasCenter = renderer.worldToCanvas(center);
  const radiusPx = renderer.worldLengthToPixels(shape.getRadius());

  ctx.arc(canvasCenter.x, canvasCenter.y, radiusPx, 0, Math.PI * 2);

  // Draw a line from center to edge to indicate rotation angle
  const angle = body.getAngle();
  ctx.moveTo(canvasCenter.x, canvasCenter.y);
  ctx.lineTo(
    canvasCenter.x + Math.cos(-angle) * radiusPx,
    canvasCenter.y + Math.sin(-angle) * radiusPx
  );
}

function drawPolygonShape(
  ctx: CanvasRenderingContext2D,
  body: planck.Body,
  shape: planck.PolygonShape,
  renderer: Renderer
): void {
  const vertices = shape.m_vertices;
  if (vertices.length === 0) return;

  const firstWorld = body.getWorldPoint(vertices[0]);
  const firstCanvas = renderer.worldToCanvas(firstWorld);
  ctx.moveTo(firstCanvas.x, firstCanvas.y);

  for (let i = 1; i < vertices.length; i++) {
    const worldPt = body.getWorldPoint(vertices[i]);
    const canvasPt = renderer.worldToCanvas(worldPt);
    ctx.lineTo(canvasPt.x, canvasPt.y);
  }

  ctx.closePath();
}

function drawEdgeShape(
  ctx: CanvasRenderingContext2D,
  body: planck.Body,
  shape: planck.EdgeShape,
  renderer: Renderer
): void {
  const v1 = body.getWorldPoint(shape.m_vertex1);
  const v2 = body.getWorldPoint(shape.m_vertex2);
  const c1 = renderer.worldToCanvas(v1);
  const c2 = renderer.worldToCanvas(v2);

  ctx.moveTo(c1.x, c1.y);
  ctx.lineTo(c2.x, c2.y);
}

function drawChainShape(
  ctx: CanvasRenderingContext2D,
  body: planck.Body,
  shape: planck.ChainShape,
  renderer: Renderer
): void {
  const vertices = shape.m_vertices;
  if (vertices.length === 0) return;

  const firstWorld = body.getWorldPoint(vertices[0]);
  const firstCanvas = renderer.worldToCanvas(firstWorld);
  ctx.moveTo(firstCanvas.x, firstCanvas.y);

  for (let i = 1; i < vertices.length; i++) {
    const worldPt = body.getWorldPoint(vertices[i]);
    const canvasPt = renderer.worldToCanvas(worldPt);
    ctx.lineTo(canvasPt.x, canvasPt.y);
  }
}

function getBodyColor(body: planck.Body): string {
  switch (body.getType()) {
    case 'static':    return COLOR_STATIC;
    case 'kinematic': return COLOR_KINEMATIC;
    case 'dynamic':   return COLOR_DYNAMIC;
  }
}
