/**
 * Custom data attached to each planck.js Body via body.setUserData().
 * Stores PhysicsKitchen-specific properties that are not part of planck.js core.
 */
export interface BodyUserData {
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
