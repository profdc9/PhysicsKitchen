/**
 * Serialized-scene undo/redo stack.
 *
 * Usage pattern:
 *   1. Before applying a user action, call push(currentJson) to save the before-state.
 *   2. Apply the action (mutates the world).
 *   3. On Ctrl+Z: call undo(currentJson) to get the before-state; restore it.
 *   4. On Ctrl+Y: call redo(currentJson) to get the after-state; restore it.
 *
 * Calling push() clears the redo stack so that new actions branch off the timeline.
 */

const MAX_UNDO_STEPS = 10;

export class UndoStack {
  /** States that can be restored by pressing Undo (most recent last). */
  private past: string[] = [];
  /** States that can be restored by pressing Redo (most recent last). */
  private future: string[] = [];

  /**
   * Save the current scene state before a user action.
   * Clears the redo stack — a new action always forks from the current position.
   */
  push(json: string): void {
    this.past.push(json);
    if (this.past.length > MAX_UNDO_STEPS) this.past.shift();
    this.future = [];
  }

  /**
   * Undo the last action.
   * Moves currentJson to the redo stack and returns the previous scene state.
   * Returns null if there is nothing to undo.
   */
  undo(currentJson: string): string | null {
    if (this.past.length === 0) return null;
    this.future.push(currentJson);
    return this.past.pop()!;
  }

  /**
   * Redo the last undone action.
   * Moves currentJson back to the undo stack and returns the next scene state.
   * Returns null if there is nothing to redo.
   */
  redo(currentJson: string): string | null {
    if (this.future.length === 0) return null;
    this.past.push(currentJson);
    if (this.past.length > MAX_UNDO_STEPS) this.past.shift();
    return this.future.pop()!;
  }

  get canUndo(): boolean { return this.past.length > 0; }
  get canRedo(): boolean { return this.future.length > 0; }

  /** Clear all history — call when a new scene is loaded or the world is reset. */
  clear(): void {
    this.past   = [];
    this.future = [];
  }
}
