import * as planck from 'planck';
import { WorldSettings } from '../physics/world';

/** Known default values for the planck.js global Settings object. */
const PLANCK_SETTING_DEFAULTS: Record<string, number> = {
  linearSlop:           0.005,
  aabbExtension:        0.1,
  velocityThreshold:    1.0,
  maxLinearCorrection:  0.2,
  baumgarte:            0.2,
  toiBaugarte:          0.75,
  timeToSleep:          0.5,
  linearSleepTolerance: 0.01,
};

export class WorldSettingsPanel {
  private container: HTMLElement;
  private getSettings: () => WorldSettings;
  private applySettings: (patch: Partial<WorldSettings>) => void;

  constructor(
    container: HTMLElement,
    getSettings: () => WorldSettings,
    applySettings: (patch: Partial<WorldSettings>) => void,
  ) {
    this.container     = container;
    this.getSettings   = getSettings;
    this.applySettings = applySettings;
  }

  /** Show the panel and rebuild its contents from current settings. */
  show(): void {
    this.rebuild();
    this.container.style.display = 'flex';
  }

  hide(): void {
    this.container.style.display = 'none';
  }

  isVisible(): boolean {
    return this.container.style.display !== 'none';
  }

  /** Rebuild displayed values from current settings (call after world reset/revert). */
  refresh(): void {
    if (this.isVisible()) this.rebuild();
  }

  // ── Panel builder ─────────────────────────────────────────────────────────

  private rebuild(): void {
    const s = this.getSettings();
    this.container.innerHTML = '';

    this.addHeading('World Settings');

    // ── Gravity ──────────────────────────────────────────────────────────────

    this.addSubHeading('Gravity');

    // Track X/Y locally so each field can update the combined object.
    let gravityX = s.gravityX;
    let gravityY = s.gravityY;

    this.addNumberField('Gravity X (m/s²)', gravityX, null, (val) => {
      gravityX = val;
      this.applySettings({ gravityX });
    });
    this.addNumberField('Gravity Y (m/s²)', gravityY, null, (val) => {
      gravityY = val;
      this.applySettings({ gravityY });
    });
    this.addCheckbox('Gravity Off', !s.gravityEnabled, (val) => {
      this.applySettings({ gravityEnabled: !val });
    });

    this.addSeparator();

    // ── Solver ───────────────────────────────────────────────────────────────

    this.addSubHeading('Solver');

    this.addCheckbox('Allow Sleep',        s.allowSleep,        (val) => this.applySettings({ allowSleep: val }));
    this.addCheckbox('Continuous Physics', s.continuousPhysics, (val) => this.applySettings({ continuousPhysics: val }));
    this.addCheckbox('Sub-stepping',       s.subStepping,       (val) => this.applySettings({ subStepping: val }));

    this.addNumberField('Time Step (s)',        s.timeStep,           0.0001, (val) => this.applySettings({ timeStep: val }));
    this.addIntegerField('Velocity Iterations', s.velocityIterations,         (val) => this.applySettings({ velocityIterations: val }));
    this.addIntegerField('Position Iterations', s.positionIterations,         (val) => this.applySettings({ positionIterations: val }));

    this.addSeparator();

    // ── Field Size ────────────────────────────────────────────────────────────

    this.addSubHeading('Field Size');

    const fieldSizeRow = document.createElement('div');
    fieldSizeRow.style.display = s.fieldSizeEnabled ? 'block' : 'none';

    this.addCheckbox('Enable', s.fieldSizeEnabled, (val) => {
      this.applySettings({ fieldSizeEnabled: val });
      fieldSizeRow.style.display = val ? 'block' : 'none';
    });

    const prev = this.container;
    this.container = fieldSizeRow;
    this.addNumberField('Radius (m)', s.fieldSize, 0.1, (val) => this.applySettings({ fieldSize: val }));
    this.container = prev;
    this.container.appendChild(fieldSizeRow);

    this.addSeparator();

    // ── Electromagnetic ───────────────────────────────────────────────────────

    this.addSubHeading('Electromagnetic');

    this.addNumberField('Wire Depth l (m)',       s.emDepth,       0.0001, (val) => this.applySettings({ emDepth: val }));
    this.addNumberField('Max Distance (m)',        s.emMaxDistance, 0,      (val) => this.applySettings({ emMaxDistance: val }));
    this.addNumberField('Min Distance clamp (m)',  s.emMinDistance, 0.0001, (val) => this.applySettings({ emMinDistance: val }));

    this.addSeparator();

    // ── Expert ───────────────────────────────────────────────────────────────

    this.addCollapsible('Expert', () => {
      const warn = document.createElement('div');
      warn.style.cssText = 'font-size:10px;color:#c88;padding:2px 0 6px;line-height:1.4;';
      warn.textContent = 'Changing these may break the simulation.';
      this.container.appendChild(warn);

      const ps = planck.Settings as unknown as Record<string, number>;
      const expertInputs: Array<{ key: string; input: HTMLInputElement }> = [];

      const addField = (key: string, min: number) => {
        const input = this.addExpertField(key, ps, min);
        expertInputs.push({ key, input });
      };

      addField('linearSlop',           0.0001);
      addField('aabbExtension',         0.0001);
      addField('velocityThreshold',     0);
      addField('maxLinearCorrection',   0);
      addField('baumgarte',             0);
      addField('toiBaugarte',           0);
      addField('timeToSleep',           0);
      addField('linearSleepTolerance',  0);

      const resetBtn = document.createElement('button');
      resetBtn.textContent = 'Reset to Defaults';
      resetBtn.style.cssText =
        'margin-top:8px;width:100%;background:#2a2a2a;color:#ccc;border:1px solid #555;' +
        'border-radius:3px;padding:4px 8px;cursor:pointer;font-size:11px;';
      resetBtn.addEventListener('click', () => {
        for (const { key, input } of expertInputs) {
          const def = PLANCK_SETTING_DEFAULTS[key];
          if (def !== undefined) {
            ps[key]      = def;
            input.value  = String(def);
          }
        }
      });
      this.container.appendChild(resetBtn);
    });
  }

  // ── Builder helpers ───────────────────────────────────────────────────────

  /**
   * Adds a number field that reads/writes directly from/to planck.Settings.
   * Returns the input element so the caller can reset its value programmatically.
   */
  private addExpertField(
    key: string,
    settings: Record<string, number>,
    min: number
  ): HTMLInputElement {
    const row   = this.makeRow(key);
    const input = document.createElement('input');
    input.type      = 'number';
    input.value     = String(settings[key] ?? 0);
    input.min       = String(min);
    input.step      = '0.001';
    input.className = 'prop-number';
    input.addEventListener('change', () => {
      const v = parseFloat(input.value);
      if (!isNaN(v)) settings[key] = v;
    });
    row.appendChild(input);
    this.container.appendChild(row);
    return input;
  }

  private addHeading(text: string): void {
    const h = document.createElement('div');
    h.className = 'prop-heading';
    h.textContent = text;
    this.container.appendChild(h);
  }

  private addSubHeading(text: string): void {
    const h = document.createElement('div');
    h.className = 'prop-subheading';
    h.textContent = text;
    this.container.appendChild(h);
  }

  private addSeparator(): void {
    const s = document.createElement('div');
    s.className = 'prop-separator';
    this.container.appendChild(s);
  }

  private addNumberField(
    label: string, value: number, min: number | null,
    onChange: (val: number) => void
  ): void {
    const row = this.makeRow(label);
    const input = document.createElement('input');
    input.type = 'number';
    input.value = String(value);
    if (min !== null) input.min = String(min);
    input.step = '0.1';
    input.className = 'prop-number';
    input.addEventListener('change', () => {
      const v = parseFloat(input.value);
      if (!isNaN(v)) onChange(v);
    });
    row.appendChild(input);
    this.container.appendChild(row);
  }

  private addIntegerField(label: string, value: number, onChange: (val: number) => void): void {
    const row = this.makeRow(label);
    const input = document.createElement('input');
    input.type = 'number';
    input.value = String(value);
    input.step = '1';
    input.className = 'prop-number';
    input.addEventListener('change', () => {
      const v = parseInt(input.value);
      if (!isNaN(v)) onChange(v);
    });
    row.appendChild(input);
    this.container.appendChild(row);
  }

  private addCheckbox(label: string, value: boolean, onChange: (val: boolean) => void): void {
    const row = this.makeRow(label);
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = value;
    input.className = 'prop-checkbox';
    input.addEventListener('change', () => onChange(input.checked));
    row.appendChild(input);
    this.container.appendChild(row);
  }

  private addCollapsible(label: string, buildContent: () => void): void {
    const wrapper = document.createElement('div');

    const header = document.createElement('button');
    header.className = 'prop-collapsible-header';
    header.textContent = `▶ ${label}`;

    const body = document.createElement('div');
    body.className = 'prop-collapsible-body';
    body.style.display = 'none';

    let open  = false;
    let built = false;

    header.addEventListener('click', () => {
      open = !open;
      header.textContent = `${open ? '▼' : '▶'} ${label}`;
      body.style.display = open ? 'block' : 'none';
      if (open && !built) {
        const prev = this.container;
        this.container = body;
        buildContent();
        this.container = prev;
        built = true;
      }
    });

    wrapper.appendChild(header);
    wrapper.appendChild(body);
    this.container.appendChild(wrapper);
  }

  private makeRow(label: string): HTMLElement {
    const row = document.createElement('div');
    row.className = 'prop-row';
    const lbl = document.createElement('span');
    lbl.className = 'prop-row-label';
    lbl.textContent = label;
    row.appendChild(lbl);
    return row;
  }
}
