/**
 * The status bar has two layers:
 * - A persistent message set by the active tool (shown when not hovering)
 * - A hover hint that temporarily overrides it while the mouse is over a button
 */
export class StatusBar {
  private element: HTMLElement;
  private persistentMessage: string = '';

  constructor(element: HTMLElement) {
    this.element = element;
    this.clear();
  }

  /** Set the persistent message for the current tool. */
  set(message: string): void {
    this.persistentMessage = message;
    this.element.textContent = message;
  }

  /** Show a temporary hover hint, overriding the persistent message. */
  showHint(message: string): void {
    this.element.textContent = message;
  }

  /** Restore the persistent message after a hover ends. */
  clearHint(): void {
    this.element.textContent = this.persistentMessage;
  }

  clear(): void {
    this.persistentMessage = '';
    this.element.textContent = '';
  }
}
