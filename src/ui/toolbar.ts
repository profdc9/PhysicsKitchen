import { StatusBar } from './statusbar';
import { attachHint } from './hoverHint';

export type ToolType =
  | 'select'
  | 'circle'
  | 'box'
  | 'polygon'
  | 'line'
  | 'segments'
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

const SIDEBAR_TOOL_LABELS: Record<Exclude<ToolType, 'select'>, string> = {
  'circle':          'Circle',
  'box':             'Box',
  'polygon':         'Polygon',
  'line':            'Line',
  'segments':        'Segments',
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

const SIDEBAR_TOOL_HINTS: Record<Exclude<ToolType, 'select'>, string> = {
  'circle':          'Circle — click to set center, drag to set radius',
  'box':             'Box — click one corner, drag to the opposite corner',
  'polygon':         'Polygon — click to place vertices; click near first vertex or Enter to close; Backspace to undo',
  'line':            'Line — a static line segment; click start point, drag to end point',
  'segments':        'Segments — a static series of connected line segments; click vertices, double-click or Enter to finish',
  'revolute-joint':  'Revolute joint — two bodies rotate freely around a shared anchor point (hinge/pin)',
  'weld-joint':      'Weld joint — rigidly fuses two bodies together at an anchor point; they cannot move relative to each other',
  'prismatic-joint': 'Prismatic joint — one body slides along an axis relative to another, like a piston or drawer',
  'distance-joint':  'Distance joint — keeps two anchor points a fixed distance apart; set frequency > 0 to make it a spring',
  'rope-joint':      'Rope joint — limits the maximum distance between two anchor points; goes slack when closer than maxLength',
  'pulley-joint':    'Pulley joint — links two bodies via a rope over two fixed pulley points; one side rises as the other falls',
  'gear-joint':      'Gear joint — couples two existing revolute or prismatic joints so their motions are linked by a gear ratio',
  'wheel-joint':     'Wheel joint — suspension spring with free rotation; ideal for vehicle wheels (chassis + wheel)',
  'friction-joint':  'Friction joint — applies 2D translational and angular friction between two bodies at an anchor point',
  'motor-joint':     'Motor joint — drives one body toward a target position and angle relative to another, like a servo',
};

export class Toolbar {
  private currentTool: ToolType = 'select';
  private callbacks: ToolChangeCallback[] = [];
  private buttons: Map<ToolType, HTMLElement> = new Map();

  constructor(sidebarEl: HTMLElement, selectBtn: HTMLButtonElement, statusBar: StatusBar) {
    this.buildSidebar(sidebarEl, statusBar);
    this.buttons.set('select', selectBtn);
    selectBtn.addEventListener('click', () => this.selectTool('select'));
    attachHint(selectBtn, 'Select — click to select, move, and edit bodies and joints', statusBar);
    this.updateButtonStates();
  }

  private buildSidebar(container: HTMLElement, statusBar: StatusBar): void {
    container.innerHTML = '';

    const shapeTools: Exclude<ToolType, 'select'>[] = ['circle', 'box', 'polygon', 'line', 'segments'];
    const jointTools: Exclude<ToolType, 'select'>[] = [
      'revolute-joint', 'weld-joint', 'prismatic-joint', 'distance-joint',
      'rope-joint', 'pulley-joint', 'gear-joint', 'wheel-joint',
      'friction-joint', 'motor-joint',
    ];

    const shapeLabel = document.createElement('div');
    shapeLabel.className = 'sidebar-group-label';
    shapeLabel.textContent = 'Shapes';
    container.appendChild(shapeLabel);

    for (const tool of shapeTools) {
      container.appendChild(this.makeButton(tool, statusBar));
    }

    const jointLabel = document.createElement('div');
    jointLabel.className = 'sidebar-group-label';
    jointLabel.textContent = 'Joints';
    container.appendChild(jointLabel);

    for (const tool of jointTools) {
      container.appendChild(this.makeButton(tool, statusBar));
    }
  }

  private makeButton(tool: Exclude<ToolType, 'select'>, statusBar: StatusBar): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.className = 'sidebar-btn';
    btn.textContent = SIDEBAR_TOOL_LABELS[tool];
    btn.addEventListener('click', () => this.selectTool(tool));
    attachHint(btn, SIDEBAR_TOOL_HINTS[tool], statusBar);
    this.buttons.set(tool, btn);
    return btn;
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
