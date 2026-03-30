import { StatusBar } from './statusbar';
import { attachHint } from './hoverHint';
import { confirm } from './confirmDialog';

type ControlsCallback = () => void;

export class SimulationControls {
  private playPauseBtn: HTMLButtonElement;
  private revertBtn: HTMLButtonElement;
  private resetBtn: HTMLButtonElement;
  private running: boolean = false;

  private onPlayCallbacks:   ControlsCallback[] = [];
  private onPauseCallbacks:  ControlsCallback[] = [];
  private onRevertCallbacks: ControlsCallback[] = [];
  private onResetCallbacks:  ControlsCallback[] = [];

  constructor(container: HTMLElement, statusBar: StatusBar) {
    this.playPauseBtn = document.createElement('button');
    this.playPauseBtn.className = 'top-btn';
    this.playPauseBtn.addEventListener('click', () => this.togglePlayPause());
    attachHint(this.playPauseBtn, 'Play / Pause — start or freeze the simulation', statusBar);

    this.revertBtn = document.createElement('button');
    this.revertBtn.className = 'top-btn';
    this.revertBtn.textContent = '↩ Revert';
    this.revertBtn.disabled = true;
    this.revertBtn.addEventListener('click', () => this.revert());
    attachHint(this.revertBtn, 'Revert — restore the scene to exactly how it was when Play was last pressed', statusBar);

    this.resetBtn = document.createElement('button');
    this.resetBtn.className = 'top-btn';
    this.resetBtn.textContent = '⏹ Reset';
    this.resetBtn.addEventListener('click', () => this.reset());
    attachHint(this.resetBtn, 'Reset — clear the entire scene and start fresh', statusBar);

    container.appendChild(this.playPauseBtn);
    container.appendChild(this.revertBtn);
    container.appendChild(this.resetBtn);

    this.updateButtons();
  }

  private togglePlayPause(): void {
    if (this.running) {
      this.pause();
    } else {
      this.play();
    }
  }

  play(): void {
    this.running = true;
    this.updateButtons();
    for (const cb of this.onPlayCallbacks) cb();
  }

  pause(): void {
    this.running = false;
    this.updateButtons();
    for (const cb of this.onPauseCallbacks) cb();
  }

  private revert(): void {
    this.pause();
    for (const cb of this.onRevertCallbacks) cb();
  }

  private async reset(): Promise<void> {
    const confirmed = await confirm('Reset the scene? All bodies, joints, and changes will be permanently lost.');
    if (!confirmed) return;
    this.pause();
    this.revertBtn.disabled = true;
    for (const cb of this.onResetCallbacks) cb();
  }

  enableRevert(): void {
    this.revertBtn.disabled = false;
  }

  isRunning(): boolean {
    return this.running;
  }

  onPlay(cb: ControlsCallback):   void { this.onPlayCallbacks.push(cb); }
  onPause(cb: ControlsCallback):  void { this.onPauseCallbacks.push(cb); }
  onRevert(cb: ControlsCallback): void { this.onRevertCallbacks.push(cb); }
  onReset(cb: ControlsCallback):  void { this.onResetCallbacks.push(cb); }

  private updateButtons(): void {
    this.playPauseBtn.textContent = this.running ? '⏸ Pause' : '▶ Play';
    this.playPauseBtn.classList.toggle('active', this.running);
  }
}
