# PhysicsKitchen — Work Plan

## Remaining Tasks (in order)

### 1. Body Handles ✓
- Handles appear and work for all shape types (circle, box, polygon, edge, chain).
- Polygon vertex drag uses closest-vertex-to-cursor approach to survive planck.js hull reordering.
- Edge/chain: move handle at midpoint/centroid; rotation pivots around that point.
- Rotation handle placed above topmost vertex handle to avoid overlap.
- Edge/chain selection uses pixel-based distance tolerance (LINE_HIT_PIXELS) converted to world units at query time.

### 2. Properties Panel — Missing Fields
Add to `propertiesPanel.ts`:
- Linear Velocity X / Y
- Angular Velocity
- Allow Sleep (checkbox)
- Active (checkbox)
- Collision Sound section (enabled checkbox; frequency + note picker; volume slider; duration — only shown when enabled)
- Collapsible "Advanced" section: filterCategoryBits, filterMaskBits (checkboxes), filterGroupIndex (integer)

### 3. Delete Selected Body / Joint
- Keyboard shortcut (Delete / Backspace) to destroy the selected body or joint.
- Must trigger `world.on('remove-body')` / `world.on('remove-joint')` cleanup already in place.

### 4. Joint Placement & Visualization (10 types)
Order of implementation:
1. RevoluteJoint (3-step: anchor → body A → body B)
2. WeldJoint (same as Revolute, renders as ✕)
3. PrismaticJoint (4-step: anchor → axis drag → body A → body B)
4. DistanceJoint (2-step: anchor A → anchor B; spring rendering when frequencyHz > 0)
5. RopeJoint (same as Distance; rope rendering)
6. WheelJoint (same as Prismatic; wheel + spring rendering)
7. FrictionJoint (same as Revolute; ✦ rendering)
8. MotorJoint (2-step: body A → body B; ↻ rendering)
9. PulleyJoint (4-step; pulley rendering)
10. GearJoint (2-step: joint A → joint B; only highlights valid joint types on hover)

Each joint needs:
- Toolbar button with its symbol
- Placement state machine
- Canvas rendering (see CLAUDE.md Joint Visualization section)
- Anchor handles (draggable, yellow)
- Properties panel section

### 5. World Settings Panel
Separate panel (not body-specific):
- Gravity X / Y + "Gravity Off" checkbox
- Allow Sleep, Continuous Physics, Sub-stepping checkboxes
- Time Step, Velocity Iterations, Position Iterations fields
- Collapsible "Expert" section with internal solver tolerances

### 6. Serialization
- Use `planck.Serializer.toJson` / `fromJson` as base.
- postSerialize hook: inject `userData` (color, shapeKind, collision sound, EM props) into JSON.
- postDeserialize hook: restore userData on load.
- Browser mode: load/save via clipboard (copy/paste JSON).
- Browser mode: load from URL `?scene=https://...` GET parameter.

### 7. Collision Sound System
- Web Audio API, pure oscillator tones (no audio files).
- Triggered in `world.on('begin-contact')` callback.
- Per-body settings already in userData: `{ enabled, frequencyHz, volume, durationMs }`.

### 8. Electromagnetic Forces
Applied each simulation step via a custom force layer. All forces act on body centroids (no EM torque).

#### Geometry
- Simulation is z-translationally invariant; global `depth` (meters) is the out-of-plane extent.
- No Lorentz cross-coupling: v × B is out-of-plane for in-plane motion, contributing nothing to 2D dynamics.

#### World EM Settings (added to World Settings panel)
- `depth` — out-of-plane wire length (meters); appears in all force and inductance formulas as `l`
- `emMaxDistance` — cutoff: body pairs farther apart than this skip EM calculations entirely
- `emMinDistance` — clamp: `r` is treated as at least this value in all formulas to avoid divergence

#### Per-Body EM Properties
- `lambda` — linear charge density (C/m)
- `currentType` — `fixed` | `sinusoidal` | `inductive`
- `current` — current value (A); for sinusoidal: amplitude `I₀`, frequency `ω`, phase `φ`
- `resistance` — wire resistance (Ω); used in inductive current integration
- `wireDiameter` — wire diameter (meters); used in self-inductance formula

#### Force Laws (both 1/r, along centroid-to-centroid unit vector r̂)
```
F_electric = λ₁λ₂ l / (2πε₀ r)    — same sign → repulsive
F_magnetic  = μ₀ I₁I₂ l / (2π r)  — same direction → attractive
```

#### Inductance
```
Self:    L_i   = μ₀l/(2π) · (ln(2l/d) - 3/4)    d = wireDiameter
Mutual:  M_ij  = μ₀l/(2π) · (ln(2l/r) - 1)       r = clamped centroid distance
```

#### Inductive Current Update (explicit ODE per timestep)
```
dM_ij/dt = -μ₀l/(2π) · (1/r_ij) · ṙ_ij          ṙ_ij = radial relative velocity

dIⱼ/dt = 0                                        (fixed)
        = I₀·ω·cos(ωt + φ)                        (sinusoidal)
        = (E_j - R_j·Iⱼ) / L_j                   (inductive — previous timestep)

E_i = -Σⱼ≠ᵢ [ (dM_ij/dt)·Iⱼ + M_ij·(dIⱼ/dt) ]

dI_i/dt = (E_i - R_i·I_i) / L_i
```
Note: using the previous timestep's `dIⱼ/dt` for inductive bodies is an explicit approximation.
An exact solution would solve an (n_inductive × n_inductive) linear system each timestep — note this in code.

## Notes
- Do NOT rebuild panel DOM every frame (breaks color pickers). Build once on selection; update `.value` only for live fields.
- All UI distances (handle sizes, hit zones, snap thresholds) are in pixels, not world units.
- `body.getWorldCenter()` does not exist in this planck.js build — use `body.getPosition()`.
