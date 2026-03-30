import * as planck from 'planck';
import { Renderer } from '../rendering/renderer';

// MouseJoint parameters for dragging bodies
const DRAG_FREQUENCY_HZ = 5.0;
const DRAG_DAMPING_RATIO = 0.7;
const DRAG_MAX_FORCE_MULTIPLIER = 1000.0; // multiplied by body mass

// How close the click AABB query half-extent is in world units
const HIT_TEST_HALF_EXTENT = 0.01;

export class SelectTool {
  private world: planck.World;
  private renderer: Renderer;
  private isSimulationRunning: () => boolean;

  private selectedBody: planck.Body | null = null;

  // MouseJoint used while dragging during simulation
  private dragAnchorBody: planck.Body;
  private mouseJoint: planck.MouseJoint | null = null;

  // Offset from body origin to drag grab point, used for paused direct-position dragging
  private dragOffset: planck.Vec2 | null = null;

  constructor(world: planck.World, renderer: Renderer, isSimulationRunning: () => boolean) {
    this.world = world;
    this.renderer = renderer;
    this.isSimulationRunning = isSimulationRunning;

    // A permanent static body used as the anchor for MouseJoint dragging
    this.dragAnchorBody = world.createBody({ type: 'static' });
  }

  getSelectedBody(): planck.Body | null {
    return this.selectedBody;
  }

  /** Call when the select tool is deactivated to clean up state. */
  deactivate(): void {
    this.endDrag();
    this.selectedBody = null;
  }

  onMouseDown(worldPos: planck.Vec2): void {
    const hit = this.hitTest(worldPos);

    if (hit) {
      this.selectedBody = hit;
      this.beginDrag(hit, worldPos);
    } else {
      this.selectedBody = null;
    }
  }

  onMouseMove(worldPos: planck.Vec2): void {
    if (this.mouseJoint) {
      // Simulation running — update MouseJoint target
      this.mouseJoint.setTarget(worldPos);
    } else if (this.dragOffset && this.selectedBody) {
      // Simulation paused — move body directly
      const newPos = planck.Vec2(
        worldPos.x - this.dragOffset.x,
        worldPos.y - this.dragOffset.y
      );
      this.selectedBody.setPosition(newPos);
      this.selectedBody.setAwake(true);
    }
  }

  onMouseUp(): void {
    this.endDrag();
  }

  /** Draw a highlight outline around the selected body. */
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
  }

  private drawFixtureHighlight(
    ctx: CanvasRenderingContext2D,
    body: planck.Body,
    fixture: planck.Fixture
  ): void {
    const shape = fixture.getShape();
    const type = shape.getType();

    ctx.beginPath();

    if (type === 'circle') {
      const s = shape as planck.CircleShape;
      const center = body.getWorldPoint(s.getCenter());
      const cp = this.renderer.worldToCanvas(center);
      const r = this.renderer.worldLengthToPixels(s.getRadius());
      ctx.arc(cp.x, cp.y, r + 3, 0, Math.PI * 2);

    } else if (type === 'polygon') {
      const s = shape as planck.PolygonShape;
      const verts = s.m_vertices;
      if (verts.length === 0) return;
      const first = this.renderer.worldToCanvas(body.getWorldPoint(verts[0]));
      ctx.moveTo(first.x, first.y);
      for (let i = 1; i < verts.length; i++) {
        const p = this.renderer.worldToCanvas(body.getWorldPoint(verts[i]));
        ctx.lineTo(p.x, p.y);
      }
      ctx.closePath();

    } else if (type === 'edge') {
      const s = shape as planck.EdgeShape;
      const c1 = this.renderer.worldToCanvas(body.getWorldPoint(s.m_vertex1));
      const c2 = this.renderer.worldToCanvas(body.getWorldPoint(s.m_vertex2));
      ctx.moveTo(c1.x, c1.y);
      ctx.lineTo(c2.x, c2.y);

    } else if (type === 'chain') {
      const s = shape as planck.ChainShape;
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

    const aabb = planck.AABB(
      planck.Vec2(worldPos.x - HIT_TEST_HALF_EXTENT, worldPos.y - HIT_TEST_HALF_EXTENT),
      planck.Vec2(worldPos.x + HIT_TEST_HALF_EXTENT, worldPos.y + HIT_TEST_HALF_EXTENT)
    );

    this.world.queryAABB(aabb, (fixture) => {
      if (fixture.testPoint(worldPos)) {
        hitBody = fixture.getBody();
        return false; // stop at first hit
      }
      return true;
    });

    return hitBody;
  }

  private beginDrag(body: planck.Body, worldPos: planck.Vec2): void {
    body.setAwake(true);

    if (this.isSimulationRunning() && body.getType() !== 'static') {
      // Use MouseJoint while simulation is running
      const mass = body.getMass();
      this.mouseJoint = this.world.createJoint(new planck.MouseJoint(
        {
          maxForce: DRAG_MAX_FORCE_MULTIPLIER * mass,
          frequencyHz: DRAG_FREQUENCY_HZ,
          dampingRatio: DRAG_DAMPING_RATIO,
        },
        this.dragAnchorBody,
        body,
        worldPos
      )) as planck.MouseJoint;
    } else {
      // Directly reposition while paused — record offset from body origin to grab point
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
