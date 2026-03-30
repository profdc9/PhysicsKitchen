import * as planck from 'planck';

/**
 * Captures a planck.js World state as JSON so it can be restored later.
 * Used to implement the Revert button — restores the world to the state
 * it was in when Play was last pressed.
 *
 * Note: Serializer.fromJson creates a brand-new World, so restoring a snapshot
 * means replacing the current World entirely. The caller (main.ts) is responsible
 * for re-wrapping it in a new PhysicsWorld and re-registering event hooks.
 */
export class WorldSnapshot {
  private data: object[] | null = null;

  /** Save the current world state. Call this just before starting the simulation. */
  capture(world: planck.World): void {
    this.data = planck.Serializer.toJson(world);
  }

  hasSnapshot(): boolean {
    return this.data !== null;
  }

  /**
   * Restore the world from the snapshot.
   * Returns a new planck.World with all bodies and joints restored.
   * Returns null if no snapshot has been captured.
   */
  restore(): planck.World | null {
    if (!this.data) return null;
    return planck.Serializer.fromJson(this.data);
  }

  clear(): void {
    this.data = null;
  }
}
