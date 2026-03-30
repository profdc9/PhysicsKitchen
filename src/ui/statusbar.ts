export class StatusBar {
  private element: HTMLElement;

  constructor(element: HTMLElement) {
    this.element = element;
    this.clear();
  }

  set(message: string): void {
    this.element.textContent = message;
  }

  clear(): void {
    this.element.textContent = '';
  }
}
