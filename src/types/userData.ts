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
  shapeKind?: 'circle' | 'box' | 'polygon' | 'line' | 'segments';

  collisionSound?: {
    enabled: boolean;
    frequencyHz: number;
    volume: number;
    durationMs: number;
  };

  /** Electromagnetic properties for this body. Absent means no EM participation. */
  em?: {
    /** Linear charge density λ (C/m) */
    lambda: number;
    /** How the current is driven */
    currentType: 'fixed' | 'sinusoidal' | 'inductive';
    /** Current I (A); for sinusoidal this is the amplitude I₀ */
    current: number;
    /** Oscillation frequency f (Hz) — sinusoidal only */
    frequencyHz: number;
    /** Phase φ (degrees) — sinusoidal only */
    phaseDeg: number;
    /** Wire resistance R (Ω) — inductive only */
    resistance: number;
    /** Wire diameter d (m) used for self-inductance — inductive only */
    wireDiameter: number;
    /** Series voltage source amplitude V₀ (V) — inductive only; 0 = purely passive */
    seriesV0: number;
    /** Series voltage frequency f_v (Hz) — inductive only */
    seriesFvHz: number;
    /** Series voltage phase φ_v (degrees) — inductive only */
    seriesPhiVDeg: number;
  };
}

/**
 * Custom data attached to each planck.js Fixture via fixture.setUserData().
 */
export interface FixtureUserData {
  // Reserved for future use (e.g. per-fixture EM properties)
}
