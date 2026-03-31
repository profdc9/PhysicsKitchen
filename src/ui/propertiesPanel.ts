import * as planck from 'planck';
import { BodyUserData } from '../types/userData';

export class PropertiesPanel {
  private container: HTMLElement;
  private currentBody: planck.Body | null = null;

  constructor(container: HTMLElement) {
    this.container = container;
    this.hide();
  }

  show(body: planck.Body): void {
    this.currentBody = body;
    this.rebuild();
    this.container.style.display = 'flex';
  }

  hide(): void {
    this.currentBody = null;
    this.container.style.display = 'none';
    this.container.innerHTML = '';
  }

  /** Call each frame while a body is selected to keep displayed values current.
   *  Currently a no-op — fields are built once on selection and updated via event listeners.
   *  Will be used when live-updating fields (e.g. velocity) are added. */
  refresh(): void {}

  private rebuild(): void {
    const body = this.currentBody!;
    const userData = (body.getUserData() as BodyUserData) ?? {};
    this.container.innerHTML = '';

    this.addHeading('Body Properties');

    // Color
    const color = userData.color ?? this.defaultColor(body);
    this.addColorPicker('Color', color, (val) => {
      this.setUserData(body, { color: val });
    });

    // Type
    this.addDropdown('Type', ['dynamic', 'static', 'kinematic'], body.getType(), (val) => {
      body.setType(val as planck.BodyType);
    });

    this.addSeparator();

    // Fixture properties — read from first fixture
    const fixture = body.getFixtureList();
    if (fixture) {
      this.addSliderField('Friction',    fixture.getFriction(),    0, 1, 0.01, (val) => {
        for (let f = body.getFixtureList(); f; f = f.getNext()) f.setFriction(val);
      });
      this.addSliderField('Restitution', fixture.getRestitution(), 0, 1, 0.01, (val) => {
        for (let f = body.getFixtureList(); f; f = f.getNext()) f.setRestitution(val);
      });
      this.addNumberField('Density (kg/m²)', fixture.getDensity(), 0.01, (val) => {
        for (let f = body.getFixtureList(); f; f = f.getNext()) {
          f.setDensity(val);
        }
        body.resetMassData();
      });
    }

    this.addSeparator();

    // Body properties
    this.addNumberField('Linear Damping',  body.getLinearDamping(),  0, (val) => body.setLinearDamping(val));
    this.addNumberField('Angular Damping', body.getAngularDamping(), 0, (val) => body.setAngularDamping(val));
    this.addNumberField('Gravity Scale',   body.getGravityScale(),   null, (val) => body.setGravityScale(val));
    this.addCheckbox('Fixed Rotation', body.isFixedRotation(), (val) => body.setFixedRotation(val));
    this.addCheckbox('Bullet',         body.isBullet(),        (val) => body.setBullet(val));

    this.addSeparator();

    // Advanced section
    this.addCollapsible('Advanced', () => {
      this.addIntegerField('Group Index', fixture?.getFilterGroupIndex() ?? 0, (val) => {
        for (let f = body.getFixtureList(); f; f = f.getNext()) {
          const filter = f.getFilterCategoryBits();
          const mask   = f.getFilterMaskBits();
          f.setFilterData({ groupIndex: val, categoryBits: filter, maskBits: mask });
        }
      });
      this.addLayerCheckboxes('Category Layers', fixture?.getFilterCategoryBits() ?? 1, (val) => {
        for (let f = body.getFixtureList(); f; f = f.getNext()) {
          f.setFilterData({ groupIndex: f.getFilterGroupIndex(), categoryBits: val, maskBits: f.getFilterMaskBits() });
        }
      });
      this.addLayerCheckboxes('Mask Layers', fixture?.getFilterMaskBits() ?? 0xFFFF, (val) => {
        for (let f = body.getFixtureList(); f; f = f.getNext()) {
          f.setFilterData({ groupIndex: f.getFilterGroupIndex(), categoryBits: f.getFilterCategoryBits(), maskBits: val });
        }
      });
    });
  }

  // ── Builder helpers ───────────────────────────────────────────────────────

  private addHeading(text: string): void {
    const h = document.createElement('div');
    h.className = 'prop-heading';
    h.textContent = text;
    this.container.appendChild(h);
  }

  private addSeparator(): void {
    const s = document.createElement('div');
    s.className = 'prop-separator';
    this.container.appendChild(s);
  }

  private addColorPicker(label: string, value: string, onChange: (val: string) => void): void {
    const row = this.makeRow(label);
    const input = document.createElement('input');
    input.type = 'color';
    input.value = this.toHexColor(value);
    input.className = 'prop-color';
    input.addEventListener('input', () => onChange(input.value));
    row.appendChild(input);
    this.container.appendChild(row);
  }

  private addDropdown(label: string, options: string[], value: string, onChange: (val: string) => void): void {
    const row = this.makeRow(label);
    const select = document.createElement('select');
    select.className = 'prop-select';
    for (const opt of options) {
      const el = document.createElement('option');
      el.value = opt;
      el.textContent = opt.charAt(0).toUpperCase() + opt.slice(1);
      if (opt === value) el.selected = true;
      select.appendChild(el);
    }
    select.addEventListener('change', () => onChange(select.value));
    row.appendChild(select);
    this.container.appendChild(row);
  }

  private addSliderField(
    label: string, value: number, min: number, max: number, step: number,
    onChange: (val: number) => void
  ): void {
    const row = this.makeRow(label);

    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = String(min); slider.max = String(max); slider.step = String(step);
    slider.value = String(value);
    slider.className = 'prop-slider';

    const text = document.createElement('input');
    text.type = 'number';
    text.min = String(min); text.max = String(max); text.step = String(step);
    text.value = value.toFixed(2);
    text.className = 'prop-number-small';

    slider.addEventListener('input', () => {
      const v = parseFloat(slider.value);
      text.value = v.toFixed(2);
      onChange(v);
    });
    text.addEventListener('change', () => {
      const v = Math.min(max, Math.max(min, parseFloat(text.value) || 0));
      slider.value = String(v);
      text.value = v.toFixed(2);
      onChange(v);
    });

    row.appendChild(slider);
    row.appendChild(text);
    this.container.appendChild(row);
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

  private addLayerCheckboxes(label: string, bits: number, onChange: (val: number) => void): void {
    const section = document.createElement('div');
    section.className = 'prop-layer-section';

    const lbl = document.createElement('div');
    lbl.className = 'prop-row-label';
    lbl.textContent = label;
    section.appendChild(lbl);

    const grid = document.createElement('div');
    grid.className = 'prop-layer-grid';

    for (let i = 0; i < 8; i++) {
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = (bits & (1 << i)) !== 0;

      const lbl2 = document.createElement('label');
      lbl2.textContent = String(i + 1);
      lbl2.style.fontSize = '11px';
      lbl2.style.color = '#aaa';

      cb.addEventListener('change', () => {
        let newBits = bits;
        if (cb.checked) newBits |= (1 << i);
        else newBits &= ~(1 << i);
        bits = newBits;
        onChange(newBits);
      });

      const cell = document.createElement('div');
      cell.style.display = 'flex';
      cell.style.flexDirection = 'column';
      cell.style.alignItems = 'center';
      cell.style.gap = '2px';
      cell.appendChild(lbl2);
      cell.appendChild(cb);
      grid.appendChild(cell);
    }

    section.appendChild(grid);
    this.container.appendChild(section);
  }

  private addCollapsible(label: string, buildContent: () => void): void {
    const wrapper = document.createElement('div');

    const header = document.createElement('button');
    header.className = 'prop-collapsible-header';
    header.textContent = `▶ ${label}`;

    const body = document.createElement('div');
    body.className = 'prop-collapsible-body';
    body.style.display = 'none';

    let open = false;
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

  // ── Utilities ─────────────────────────────────────────────────────────────

  private setUserData(body: planck.Body, patch: Partial<BodyUserData>): void {
    const existing = (body.getUserData() as BodyUserData) ?? {};
    body.setUserData({ ...existing, ...patch });
  }

  private defaultColor(body: planck.Body): string {
    switch (body.getType()) {
      case 'static':    return '#80c080';
      case 'kinematic': return '#c0a0e0';
      case 'dynamic':   return '#e0e0ff';
    }
  }

  private toHexColor(color: string): string {
    // If already a 6-digit hex, return as-is
    if (/^#[0-9a-fA-F]{6}$/.test(color)) return color;
    // Fallback
    return '#e0e0ff';
  }
}
