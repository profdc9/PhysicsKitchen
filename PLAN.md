# PhysicsKitchen — Work Plan

## Completed

### 1. Body Handles ✓
- Handles appear and work for all shape types (circle, box, polygon, edge, chain).
- Polygon vertex drag uses closest-vertex-to-cursor approach to survive planck.js hull reordering.
- Edge/chain: move handle at midpoint/centroid; rotation pivots around that point.
- Rotation handle placed above topmost vertex handle to avoid overlap.
- Edge/chain selection uses pixel-based distance tolerance (LINE_HIT_PIXELS) converted to world units at query time.

### 2. Properties Panel — Body Fields ✓
- All body property fields implemented in `propertiesPanel.ts`.

### 3. Delete Selected Body / Joint ✓
- Delete button in top bar; keyboard shortcut (Delete / Backspace).
- Triggers `world.on('remove-body')` / `world.on('remove-joint')` cleanup.

### 4. Joint Placement & Visualization ✓
All 10 joint types implemented:
- RevoluteJoint, WeldJoint, FrictionJoint (AWB flow: anchor → body A → body B)
- PrismaticJoint, WheelJoint (axis flow: anchor → axis drag → body A → body B)
- DistanceJoint, RopeJoint (two-anchor flow)
- MotorJoint (body A → body B)
- PulleyJoint (4-step)
- GearJoint (select two existing revolute/prismatic joints)

Each joint has toolbar button, placement state machine, canvas rendering, anchor handles, and joint selection (click to select, highlighted in green, deletable).

GearJoint cascade deletion: when a revolute or prismatic joint is destroyed, any GearJoint referencing it is also destroyed automatically.

**Bug fixed — gear joint selection offset after simulation:** Root cause was `resizeCanvas()` using `canvas.offsetHeight` (767px) instead of `getBoundingClientRect().height` (740px). The 27px difference (the status bar height) caused `worldToCanvas()` to use the wrong canvas center for Y, creating a coordinate mismatch that grew with distance from world origin. Fixed by using `getBoundingClientRect()` in `resizeCanvas()`. Hit-test radius left at 14 px (harmless).

## Remaining Tasks (in order)

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
