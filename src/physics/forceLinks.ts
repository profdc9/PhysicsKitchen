import * as planck from 'planck';

/** Parameters for a pairwise power-law force between two bodies. */
export interface ForceLink {
  bodyA: planck.Body;
  bodyB: planck.Body;
  /** Force coefficient k.  Positive = attractive, negative = repulsive. */
  coefficient: number;
  /**
   * Exponent n in F = k * (r − L₀)^n.
   * Common values: −2 (gravity/Coulomb-like), 1 (spring), 0 (constant).
   */
  exponent: number;
  /**
   * Rest length L₀ (m).  Force is zero when centroid separation equals L₀.
   * Attractive (positive k) when r > L₀, repulsive when r < L₀.
   */
  restLength: number;
  /**
   * Minimum separation clamp (m).  The effective r used in the force law
   * is never allowed below this — prevents singularities at r → 0.
   */
  minDistance: number;
  /**
   * Maximum separation (m) beyond which the force is not applied.
   * 0 = no limit.
   */
  maxDistance: number;
}

/** Default parameters applied to a newly created ForceLink. */
export const DEFAULT_FORCE_LINK_PARAMS: Omit<ForceLink, 'bodyA' | 'bodyB'> = {
  coefficient: 1,
  exponent:    -2,
  restLength:  0,
  minDistance: 0.1,
  maxDistance: 0,
};

/**
 * Apply pairwise power-law forces for all ForceLinks.
 *
 * Force law:  F = k * (r_eff − L₀)^n
 *   r      = actual centroid separation
 *   r_eff  = max(r, minDistance)   — clamped to avoid singularities
 *   positive F = attractive (force on A points toward B, force on B toward A)
 *
 * Edge cases skipped:
 *   - bodies on top of each other (r = 0, unit vector undefined)
 *   - r beyond maxDistance (when maxDistance > 0)
 *   - effective quantity ≤ 0 when n < 0 (would produce −∞ or NaN)
 */
export function applyForceLinks(forceLinks: ForceLink[]): void {
  for (const fl of forceLinks) {
    const posA = fl.bodyA.getPosition();
    const posB = fl.bodyB.getPosition();

    const dx = posB.x - posA.x;
    const dy = posB.y - posA.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    // Need a finite nonzero distance to form a unit vector
    if (dist === 0) continue;

    // Beyond max interaction range — skip
    if (fl.maxDistance > 0 && dist > fl.maxDistance) continue;

    // Clamp to minDistance for force calculation to avoid singularities
    const rEff = Math.max(dist, fl.minDistance);
    const effective = rEff - fl.restLength;

    // Avoid raising a non-positive base to a negative exponent (→ ±∞ / NaN)
    if (effective <= 0 && fl.exponent < 0) continue;

    const magnitude = fl.coefficient * Math.pow(effective, fl.exponent);

    // Unit vector from A toward B (positive magnitude = attractive)
    const ux = dx / dist;
    const uy = dy / dist;

    fl.bodyA.applyForce(planck.Vec2( magnitude * ux,  magnitude * uy), fl.bodyA.getPosition(), true);
    fl.bodyB.applyForce(planck.Vec2(-magnitude * ux, -magnitude * uy), fl.bodyB.getPosition(), true);
  }
}
