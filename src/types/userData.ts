/**
 * Custom data attached to each planck.js Body via body.setUserData().
 * Stores PhysicsKitchen-specific properties that are not part of planck.js core.
 */
export interface BodyUserData {
  /** CSS color string for rendering this body. If absent, default color for body type is used. */
  color?: string;

  /**
   * Records which tool created this body so editing handles know whether to treat a
   * 4-vertex PolygonShape as a box (two corner handles) or a free polygon (per-vertex handles).
   * Absent on bodies created outside InputHandler (e.g. the initial ground plane).
   */
  shapeKind?: 'circle' | 'box' | 'polygon' | 'edge' | 'chain';

  collisionSound?: {
    enabled: boolean;
    frequencyHz: number;
    volume: number;
    durationMs: number;
  };
}

/**
 * Custom data attached to each planck.js Fixture via fixture.setUserData().
 */
export interface FixtureUserData {
  // Reserved for future use (e.g. per-fixture EM properties)
}
