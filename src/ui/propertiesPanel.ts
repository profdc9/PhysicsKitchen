import * as planck from 'planck';
import { BodyUserData } from '../types/userData';

/** Human-readable labels for each joint type. */
const JOINT_TYPE_LABELS: Record<string, string> = {
  'revolute-joint':  'Revolute Joint',
  'weld-joint':      'Weld Joint',
  'prismatic-joint': 'Prismatic Joint',
  'distance-joint':  'Distance Joint',
  'rope-joint':      'Rope Joint',
  'wheel-joint':     'Wheel Joint',
  'friction-joint':  'Friction Joint',
  'motor-joint':     'Motor Joint',
  'pulley-joint':    'Pulley Joint',
  'gear-joint':      'Gear Joint',
};

/** Common musical notes for the collision-sound frequency picker. */
const MUSICAL_NOTES: Array<{ label: string; hz: number }> = [
  { label: 'A3',  hz:  220.00 },
  { label: 'B3',  hz:  246.94 },
  { label: 'C4',  hz:  261.63 },
  { label: 'D4',  hz:  293.66 },
  { label: 'E4',  hz:  329.63 },
  { label: 'F4',  hz:  349.23 },
  { label: 'G4',  hz:  392.00 },
  { label: 'A4',  hz:  440.00 },
  { label: 'B4',  hz:  493.88 },
  { label: 'C5',  hz:  523.25 },
  { label: 'D5',  hz:  587.33 },
  { label: 'E5',  hz:  659.25 },
  { label: 'G5',  hz:  783.99 },
  { label: 'A5',  hz:  880.00 },
  { label: 'C6',  hz: 1046.50 },
];

/** Default EM properties applied when a body has no EM data yet. */
const DEFAULT_EM: NonNullable<BodyUserData['em']> = {
  lambda:         0,
  currentType:    'fixed',
  current:        0,
  frequencyHz:    1,
  phaseDeg:       0,
  resistance:     1,
  wireDiameter:   0.001,
  seriesV0:       0,
  seriesFvHz:     1,
  seriesPhiVDeg:  0,
};

export class PropertiesPanel {
  private container: HTMLElement;
  private currentBody:  planck.Body  | null = null;
  private currentJoint: planck.Joint | null = null;
  private onBeforeChange: (() => void) | null;

  constructor(container: HTMLElement, onBeforeChange: (() => void) | null = null) {
    this.container = container;
    this.onBeforeChange = onBeforeChange;
    this.hide();
  }

  show(body: planck.Body): void {
    this.currentBody  = body;
    this.currentJoint = null;
    this.rebuild();
    this.container.style.display = 'flex';
  }

  showJoint(joint: planck.Joint): void {
    this.currentBody  = null;
    this.currentJoint = joint;
    this.rebuildJoint();
    this.container.style.display = 'flex';
  }

  hide(): void {
    this.currentBody  = null;
    this.currentJoint = null;
    this.container.style.display = 'none';
    this.container.innerHTML = '';
  }

  /** Call each frame while a body is selected to keep displayed values current.
   *  Currently a no-op — fields are built once on selection and updated via event listeners.
   *  Will be used when live-updating fields (e.g. velocity) are added. */
  refresh(): void {}

  private rebuild(): void {
    const body     = this.currentBody!;
    const userData = (body.getUserData() as BodyUserData) ?? {};
    this.container.innerHTML = '';

    this.addHeading('Body Properties');

    // ── Appearance & type ────────────────────────────────────────────────────

    const color = userData.color ?? this.defaultColor(body);
    this.addColorPicker('Color', color, (val) => {
      this.setUserData(body, { color: val });
    });

    this.addDropdown('Type', ['dynamic', 'static', 'kinematic'], body.getType(), (val) => {
      body.setType(val as planck.BodyType);
    });

    this.addSeparator();

    // ── Fixture properties — read from first fixture ─────────────────────────

    const fixture = body.getFixtureList();
    if (fixture) {
      this.addSliderField('Friction',    fixture.getFriction(),    0, 1, 0.01, (val) => {
        for (let f = body.getFixtureList(); f; f = f.getNext()) f.setFriction(val);
      });
      this.addSliderField('Restitution', fixture.getRestitution(), 0, 1, 0.01, (val) => {
        for (let f = body.getFixtureList(); f; f = f.getNext()) f.setRestitution(val);
      });
      this.addNumberField('Density (kg/m²)', fixture.getDensity(), 0.01, (val) => {
        for (let f = body.getFixtureList(); f; f = f.getNext()) f.setDensity(val);
        body.resetMassData();
      });
    }

    this.addSeparator();

    // ── Body dynamics ────────────────────────────────────────────────────────

    this.addNumberField('Linear Damping',  body.getLinearDamping(),  0,    (val) => body.setLinearDamping(val));
    this.addNumberField('Angular Damping', body.getAngularDamping(), 0,    (val) => body.setAngularDamping(val));
    this.addNumberField('Gravity Scale',   body.getGravityScale(),   null, (val) => body.setGravityScale(val));
    this.addCheckbox('Fixed Rotation', body.isFixedRotation(), (val) => body.setFixedRotation(val));
    this.addCheckbox('Bullet',         body.isBullet(),        (val) => body.setBullet(val));

    this.addSeparator();

    // ── Velocity & sleep ─────────────────────────────────────────────────────

    this.buildVelocitySection(body);

    this.addSeparator();

    // ── Collision sound ──────────────────────────────────────────────────────

    this.buildCollisionSoundSection(body, userData);

    this.addSeparator();

    // ── Electromagnetic properties ───────────────────────────────────────────

    this.buildEmPropertiesSection(body, userData);

    this.addSeparator();

    // ── Advanced (collision filters) ─────────────────────────────────────────

    this.addCollapsible('Advanced', () => {
      this.addIntegerField('Group Index', fixture?.getFilterGroupIndex() ?? 0, (val) => {
        for (let f = body.getFixtureList(); f; f = f.getNext()) {
          f.setFilterData({ groupIndex: val, categoryBits: f.getFilterCategoryBits(), maskBits: f.getFilterMaskBits() });
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

  // ── Joint panel ───────────────────────────────────────────────────────────

  private rebuildJoint(): void {
    const joint    = this.currentJoint!;
    const type     = joint.getType();
    const typeName = JOINT_TYPE_LABELS[type] ?? type;
    this.container.innerHTML = '';

    this.addHeading(`${typeName} Properties`);

    switch (type) {
      case 'distance-joint':  this.buildDistanceJointSection(joint as planck.DistanceJoint);  break;
      case 'rope-joint':      this.buildRopeJointSection(joint as planck.RopeJoint);          break;
      case 'wheel-joint':     this.buildWheelJointSection(joint as planck.WheelJoint);        break;
      case 'friction-joint':  this.buildFrictionJointSection(joint as planck.FrictionJoint);  break;
      case 'motor-joint':     this.buildMotorJointSection(joint as planck.MotorJoint);        break;
      // pulley-joint: ratio is fixed at construction time — no editable parameters
      case 'gear-joint':      this.buildGearJointSection(joint as planck.GearJoint);          break;
      // revolute-joint, weld-joint, prismatic-joint have no editable parameters
    }
  }

  private buildDistanceJointSection(joint: planck.DistanceJoint): void {
    const j = joint as any;

    this.addNumberField('Length (m)', joint.getLength(), 0.001, (val) => {
      joint.setLength(val);
    });
    this.addNumberField('Frequency (Hz, 0 = rigid)', j.m_frequencyHz ?? 0, 0, (val) => {
      j.m_frequencyHz = val;
    });
    this.addNumberField('Damping Ratio', j.m_dampingRatio ?? 0, 0, (val) => {
      j.m_dampingRatio = val;
    });
  }

  private buildRopeJointSection(joint: planck.RopeJoint): void {
    this.addNumberField('Max Length (m)', joint.getMaxLength(), 0.001, (val) => {
      joint.setMaxLength(val);
    });
  }

  private buildWheelJointSection(joint: planck.WheelJoint): void {
    const j = joint as any;

    this.addNumberField('Frequency (Hz, 0 = rigid)', j.m_frequencyHz ?? 0, 0, (val) => {
      j.m_frequencyHz = val;
    });
    this.addNumberField('Damping Ratio', j.m_dampingRatio ?? 0, 0, (val) => {
      j.m_dampingRatio = val;
    });

    this.addSeparator();

    // Motor sub-section: show speed/torque fields only when motor is enabled.
    const motorFields = document.createElement('div');
    const isEnabled = joint.isMotorEnabled();
    motorFields.style.display = isEnabled ? 'block' : 'none';

    this.addCheckbox('Enable Motor', isEnabled, (val) => {
      joint.enableMotor(val);
      motorFields.style.display = val ? 'block' : 'none';
    });

    const prev = this.container;
    this.container = motorFields;
    this.addNumberField('Motor Speed (rad/s)', joint.getMotorSpeed(), null, (val) => {
      joint.setMotorSpeed(val);
    });
    this.addNumberField('Max Motor Torque (N·m)', joint.getMaxMotorTorque(), 0, (val) => {
      joint.setMaxMotorTorque(val);
    });
    this.container = prev;
    this.container.appendChild(motorFields);
  }

  private buildFrictionJointSection(joint: planck.FrictionJoint): void {
    this.addNumberField('Max Force (N)', joint.getMaxForce(), 0, (val) => {
      joint.setMaxForce(val);
    });
    this.addNumberField('Max Torque (N·m)', joint.getMaxTorque(), 0, (val) => {
      joint.setMaxTorque(val);
    });
  }

  private buildMotorJointSection(joint: planck.MotorJoint): void {
    const offset  = joint.getLinearOffset();
    let offsetX   = offset.x;
    let offsetY   = offset.y;

    this.addNumberField('Linear Offset X (m)', offsetX, null, (val) => {
      offsetX = val;
      joint.setLinearOffset(planck.Vec2(offsetX, offsetY));
    });
    this.addNumberField('Linear Offset Y (m)', offsetY, null, (val) => {
      offsetY = val;
      joint.setLinearOffset(planck.Vec2(offsetX, offsetY));
    });
    this.addNumberField('Angular Offset (rad)', joint.getAngularOffset(), null, (val) => {
      joint.setAngularOffset(val);
    });

    this.addSeparator();

    this.addNumberField('Max Force (N)', joint.getMaxForce(), 0, (val) => {
      joint.setMaxForce(val);
    });
    this.addNumberField('Max Torque (N·m)', joint.getMaxTorque(), 0, (val) => {
      joint.setMaxTorque(val);
    });
    this.addNumberField('Correction Factor', joint.getCorrectionFactor(), 0, (val) => {
      joint.setCorrectionFactor(val);
    });
  }

  private buildGearJointSection(joint: planck.GearJoint): void {
    const j = joint as any;
    this.addNumberField('Ratio', j.m_ratio ?? 1, null, (val) => {
      j.m_ratio = val;
    });
  }

  // ── Section builders ──────────────────────────────────────────────────────

  private buildVelocitySection(body: planck.Body): void {
    // Track X/Y independently so each field can update the combined Vec2.
    const vel   = body.getLinearVelocity();
    let velX    = vel.x;
    let velY    = vel.y;

    this.addNumberField('Linear Velocity X (m/s)', velX, null, (val) => {
      velX = val;
      body.setLinearVelocity(planck.Vec2(velX, velY));
    });
    this.addNumberField('Linear Velocity Y (m/s)', velY, null, (val) => {
      velY = val;
      body.setLinearVelocity(planck.Vec2(velX, velY));
    });
    this.addNumberField('Angular Velocity (rad/s)', body.getAngularVelocity(), null, (val) => {
      body.setAngularVelocity(val);
    });
    this.addCheckbox('Allow Sleep', body.isSleepingAllowed(), (val) => body.setSleepingAllowed(val));
    this.addCheckbox('Active',      body.isActive(),          (val) => body.setActive(val));
  }

  private buildCollisionSoundSection(body: planck.Body, userData: BodyUserData): void {
    this.addSubHeading('Collision Sound');

    const sound = userData.collisionSound ?? {
      enabled:     false,
      frequencyHz: 440,
      volume:      0.5,
      durationMs:  100,
    };

    // Sub-container shown/hidden by the Enabled checkbox.
    const subContainer = document.createElement('div');
    subContainer.style.display = sound.enabled ? 'block' : 'none';

    this.addCheckbox('Enabled', sound.enabled, (val) => {
      const updated = { ...sound, enabled: val };
      Object.assign(sound, updated);
      this.setUserData(body, { collisionSound: updated });
      subContainer.style.display = val ? 'block' : 'none';
    });

    // Populate sub-container.
    const prev = this.container;
    this.container = subContainer;

    this.addFrequencyWithNotePicker('Frequency (Hz)', sound.frequencyHz, (val) => {
      sound.frequencyHz = val;
      this.setUserData(body, { collisionSound: { ...sound } });
    });
    this.addSliderField('Volume', sound.volume, 0, 1, 0.01, (val) => {
      sound.volume = val;
      this.setUserData(body, { collisionSound: { ...sound } });
    });
    this.addNumberField('Duration (ms)', sound.durationMs, 1, (val) => {
      sound.durationMs = val;
      this.setUserData(body, { collisionSound: { ...sound } });
    });

    this.container = prev;
    this.container.appendChild(subContainer);
  }

  private buildEmPropertiesSection(body: planck.Body, userData: BodyUserData): void {
    this.addSubHeading('EM Properties');

    const em = { ...DEFAULT_EM, ...userData.em };

    const save = () => this.setUserData(body, { em: { ...em } });

    this.addNumberField('Charge λ (C/m)', em.lambda, null, (val) => {
      em.lambda = val; save();
    });

    // ── Current type dropdown + conditional sub-fields ──────────────────────

    // Sub-containers for sinusoidal-only and inductive-only fields.
    const sinFields = document.createElement('div');
    const indFields = document.createElement('div');

    const applyVisibility = (type: string) => {
      sinFields.style.display = (type === 'sinusoidal')            ? 'block' : 'none';
      indFields.style.display = (type === 'inductive')             ? 'block' : 'none';
    };
    applyVisibility(em.currentType);

    this.addDropdown(
      'Current Type',
      ['fixed', 'sinusoidal', 'inductive'],
      em.currentType,
      (val) => {
        em.currentType = val as typeof em.currentType;
        save();
        applyVisibility(val);
      }
    );

    // Current amplitude (used by all three types, but label differs for sinusoidal).
    this.addNumberField('Current (A)', em.current, null, (val) => {
      em.current = val; save();
    });

    // Sinusoidal-only fields.
    const prev = this.container;

    this.container = sinFields;
    this.addNumberField('Frequency f (Hz)', em.frequencyHz, 0, (val) => {
      em.frequencyHz = val; save();
    });
    this.addNumberField('Phase φ (°)', em.phaseDeg, null, (val) => {
      em.phaseDeg = val; save();
    });

    // Inductive-only fields.
    this.container = indFields;
    this.addNumberField('Resistance R (Ω)', em.resistance, 0, (val) => {
      em.resistance = val; save();
    });
    this.addNumberField('Wire Diameter d (m)', em.wireDiameter, 0, (val) => {
      em.wireDiameter = val; save();
    });
    this.addSubHeading('Series Voltage Source');
    this.addNumberField('Amplitude V₀ (V)', em.seriesV0, 0, (val) => {
      em.seriesV0 = val; save();
    });
    this.addNumberField('Frequency f_v (Hz)', em.seriesFvHz, 0, (val) => {
      em.seriesFvHz = val; save();
    });
    this.addNumberField('Phase φ_v (°)', em.seriesPhiVDeg, null, (val) => {
      em.seriesPhiVDeg = val; save();
    });

    this.container = prev;
    this.container.appendChild(sinFields);
    this.container.appendChild(indFields);
  }

  // ── Builder helpers ───────────────────────────────────────────────────────

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

  private addColorPicker(label: string, value: string, onChange: (val: string) => void): void {
    const row = this.makeRow(label);
    const input = document.createElement('input');
    input.type = 'color';
    input.value = this.toHexColor(value);
    input.className = 'prop-color';
    // Snapshot before the color dialog opens so the original color can be restored.
    input.addEventListener('mousedown', () => this.onBeforeChange?.());
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
    select.addEventListener('change', () => {
      this.onBeforeChange?.();
      onChange(select.value);
    });
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

    // Snapshot before the slider drag starts; input events during drag don't re-snapshot.
    slider.addEventListener('mousedown', () => this.onBeforeChange?.());
    slider.addEventListener('input', () => {
      const v = parseFloat(slider.value);
      text.value = v.toFixed(2);
      onChange(v);
    });
    text.addEventListener('change', () => {
      this.onBeforeChange?.();
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
      this.onBeforeChange?.();
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
      this.onBeforeChange?.();
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
    input.addEventListener('change', () => {
      this.onBeforeChange?.();
      onChange(input.checked);
    });
    row.appendChild(input);
    this.container.appendChild(row);
  }

  /**
   * A number field for frequency, with a small musical-note dropdown alongside.
   * Selecting a note snaps the frequency field to that note's Hz value.
   */
  private addFrequencyWithNotePicker(label: string, value: number, onChange: (val: number) => void): void {
    const row = this.makeRow(label);

    const freqInput = document.createElement('input');
    freqInput.type  = 'number';
    freqInput.min   = '1';
    freqInput.step  = '1';
    freqInput.value = String(value);
    freqInput.className = 'prop-number-small';
    freqInput.addEventListener('change', () => {
      const v = parseFloat(freqInput.value);
      if (!isNaN(v) && v > 0) {
        this.onBeforeChange?.();
        noteSelect.value = '';  // deselect note if frequency was typed manually
        onChange(v);
      }
    });

    const noteSelect = document.createElement('select');
    noteSelect.className = 'prop-select-small';

    const placeholder = document.createElement('option');
    placeholder.value   = '';
    placeholder.textContent = '♩';
    noteSelect.appendChild(placeholder);

    for (const note of MUSICAL_NOTES) {
      const opt = document.createElement('option');
      opt.value       = String(note.hz);
      opt.textContent = note.label;
      noteSelect.appendChild(opt);
    }

    noteSelect.addEventListener('change', () => {
      const hz = parseFloat(noteSelect.value);
      if (!isNaN(hz)) {
        this.onBeforeChange?.();
        freqInput.value = String(hz);
        onChange(hz);
      }
    });

    row.appendChild(freqInput);
    row.appendChild(noteSelect);
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
      cell.style.display       = 'flex';
      cell.style.flexDirection = 'column';
      cell.style.alignItems    = 'center';
      cell.style.gap           = '2px';
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
    if (/^#[0-9a-fA-F]{6}$/.test(color)) return color;
    return '#e0e0ff';
  }
}
