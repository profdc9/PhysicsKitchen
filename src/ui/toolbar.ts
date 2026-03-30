export type ToolType =
  | 'select'
  | 'circle'
  | 'box'
  | 'polygon'
  | 'edge'
  | 'chain'
  | 'revolute-joint'
  | 'weld-joint'
  | 'prismatic-joint'
  | 'distance-joint'
  | 'rope-joint'
  | 'pulley-joint'
  | 'gear-joint'
  | 'wheel-joint'
  | 'friction-joint'
  | 'motor-joint';

type ToolChangeCallback = (tool: ToolType) => void;

const TOOL_LABELS: Record<ToolType, string> = {
  'select':          'Select',
  'circle':          'Circle',
  'box':             'Box',
  'polygon':         'Polygon',
  'edge':            'Edge',
  'chain':           'Chain',
  'revolute-joint':  '⊕ Revolute',
  'weld-joint':      '✕ Weld',
  'prismatic-joint': '⇔ Prismatic',
  'distance-joint':  '— Distance',
  'rope-joint':      '∿ Rope',
  'pulley-joint':    '⑃ Pulley',
  'gear-joint':      '⚙ Gear',
  'wheel-joint':     '◎ Wheel',
  'friction-joint':  '✦ Friction',
  'motor-joint':     '↻ Motor',
};

export class Toolbar {
  private currentTool: ToolType = 'select';
  private callbacks: ToolChangeCallback[] = [];
  private buttons: Map<ToolType, HTMLButtonElement> = new Map();

  constructor(container: HTMLElement) {
    this.build(container);
  }

  private build(container: HTMLElement): void {
    container.innerHTML = '';

    const groups: ToolType[][] = [
      ['select'],
      ['circle', 'box', 'polygon', 'edge', 'chain'],
      ['revolute-joint', 'weld-joint', 'prismatic-joint', 'distance-joint',
       'rope-joint', 'pulley-joint', 'gear-joint', 'wheel-joint',
       'friction-joint', 'motor-joint'],
    ];

    for (const group of groups) {
      const groupEl = document.createElement('div');
      groupEl.className = 'toolbar-group';

      for (const tool of group) {
        const btn = document.createElement('button');
        btn.className = 'toolbar-btn';
        btn.textContent = TOOL_LABELS[tool];
        btn.dataset.tool = tool;
        btn.addEventListener('click', () => this.selectTool(tool));
        this.buttons.set(tool, btn);
        groupEl.appendChild(btn);
      }

      container.appendChild(groupEl);
    }

    this.updateButtonStates();
  }

  selectTool(tool: ToolType): void {
    this.currentTool = tool;
    this.updateButtonStates();
    for (const cb of this.callbacks) cb(tool);
  }

  getCurrentTool(): ToolType {
    return this.currentTool;
  }

  onChange(callback: ToolChangeCallback): void {
    this.callbacks.push(callback);
  }

  private updateButtonStates(): void {
    for (const [tool, btn] of this.buttons) {
      btn.classList.toggle('active', tool === this.currentTool);
    }
  }
}
