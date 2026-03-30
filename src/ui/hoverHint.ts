import { StatusBar } from './statusbar';

/** Attach a status bar hover hint to a button element. */
export function attachHint(btn: HTMLElement, hint: string, statusBar: StatusBar): void {
  btn.addEventListener('mouseenter', () => statusBar.showHint(hint));
  btn.addEventListener('mouseleave', () => statusBar.clearHint());
}
