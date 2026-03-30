import * as planck from 'planck';

/**
 * Captures a planck.js World state as JSON so it can be restored later.
 * Used to implement the Revert button — restores the world to the state
 * it was in when Play was first pressed after the last reset/revert/edit.
 *
 * The snapshot is only captured once per edit session. It is invalidated
 * (and will recapture on the next Play press) after a revert, reset, or
 * explicit invalidation (e.g. when the user edits the scene while paused).
 *
 * Note: Serializer.fromJson creates a brand-new World, so restoring a snapshot
 * means replacing the current World entirely. The caller (main.ts) is responsible
 * for re-wrapping it in a new PhysicsWorld and re-registering event hooks.
 */
export class WorldSnapshot {
  private data: object[] | null = null;
  private captured: boolean = false;

  /**
   * Capture the current world state if not already captured this session.
   * Returns true if a new snapshot was taken, false if one already existed.
   */
  captureIfNeeded(world: planck.World): boolean {
    if (this.captured) return false;
    this.data = planck.Serializer.toJson(world);
    this.captured = true;
    return true;
  }

  hasSnapshot(): boolean {
    return this.data !== null;
  }

  /**
   * Restore the world from the snapshot.
   * Marks the snapshot as needing recapture so the next Play press
   * will capture the restored state as the new baseline.
   * Returns a new planck.World, or null if no snapshot exists.
   */
  restore(): planck.World | null {
    if (!this.data) return null;
    const world = planck.Serializer.fromJson(this.data);
    // After reverting, the next Play press should recapture from this restored state
    this.captured = false;
    return world;
  }

  /** Fully clear the snapshot (e.g. on reset). */
  clear(): void {
    this.data = null;
    this.captured = false;
  }

  /**
   * Invalidate the snapshot so it will be recaptured on next Play press.
   * Call this when the user edits the scene while paused.
   */
  invalidate(): void {
    this.captured = false;
  }
}
