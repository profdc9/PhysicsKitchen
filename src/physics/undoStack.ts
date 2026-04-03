/**
 * Serialized-scene undo/redo stack with a memory budget.
 *
 * Instead of a fixed step count, the stack keeps as many snapshots as fit
 * within MAX_UNDO_BYTES total.  When adding a new entry would exceed the
 * budget, the oldest entries are discarded until there is room.
 *
 * JavaScript strings are UTF-16, so each character occupies 2 bytes.
 * Scene JSON is ASCII-only, so string.length * 2 is an exact byte count.
 *
 * Usage pattern:
 *   1. Before applying a user action, call push(currentJson) to save the before-state.
 *   2. Apply the action (mutates the world).
 *   3. On Ctrl+Z: call undo(currentJson) to get the before-state; restore it.
 *   4. On Ctrl+Y: call redo(currentJson) to get the after-state; restore it.
 *
 * Calling push() clears the redo stack so that new actions branch off the timeline.
 */

const MAX_UNDO_BYTES = 10 * 1024 * 1024;   // 10 MB total across past + future

/** Byte size of a JSON snapshot string (UTF-16: 2 bytes per character). */
function byteSize(json: string): number {
  return json.length * 2;
}

export class UndoStack {
  /** States that can be restored by pressing Undo (most recent last). */
  private past: string[] = [];
  /** States that can be restored by pressing Redo (most recent last). */
  private future: string[] = [];
  /** Running total of bytes across both stacks. */
  private totalBytes = 0;

  /**
   * Save the current scene state before a user action.
   * Clears the redo stack — a new action always forks from the current position.
   * Evicts the oldest past entries if the budget would be exceeded.
   */
  push(json: string): void {
    // Redo stack is discarded; subtract its bytes first
    for (const s of this.future) this.totalBytes -= byteSize(s);
    this.future = [];

    const incoming = byteSize(json);

    // Evict oldest past entries until the new entry fits within the budget
    while (this.past.length > 0 && this.totalBytes + incoming > MAX_UNDO_BYTES) {
      this.totalBytes -= byteSize(this.past.shift()!);
    }

    this.past.push(json);
    this.totalBytes += incoming;
  }

  /**
   * Undo the last action.
   * Moves currentJson to the redo stack and returns the previous scene state.
   * Returns null if there is nothing to undo.
   */
  undo(currentJson: string): string | null {
    if (this.past.length === 0) return null;
    this.future.push(currentJson);
    this.totalBytes += byteSize(currentJson);
    const prev = this.past.pop()!;
    this.totalBytes -= byteSize(prev);
    return prev;
  }

  /**
   * Redo the last undone action.
   * Moves currentJson back to the undo stack and returns the next scene state.
   * Returns null if there is nothing to redo.
   */
  redo(currentJson: string): string | null {
    if (this.future.length === 0) return null;
    this.past.push(currentJson);
    this.totalBytes += byteSize(currentJson);
    const next = this.future.pop()!;
    this.totalBytes -= byteSize(next);
    return next;
  }

  get canUndo(): boolean { return this.past.length > 0; }
  get canRedo(): boolean { return this.future.length > 0; }

  /** Clear all history — call when a new scene is loaded or the world is reset. */
  clear(): void {
    this.past       = [];
    this.future     = [];
    this.totalBytes = 0;
  }
}
