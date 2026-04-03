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

### 5. Properties Panel — Joint Fields ✓
- `PropertiesPanel.showJoint()` builds per-type panels for all 10 joint types.
- Editable fields per `docs/joints.md`: DistanceJoint (length, frequencyHz, dampingRatio), RopeJoint (maxLength), WheelJoint (frequencyHz, dampingRatio, enable motor, motorSpeed, maxMotorTorque), FrictionJoint (maxForce, maxTorque), MotorJoint (linearOffset X/Y, angularOffset, maxForce, maxTorque, correctionFactor), GearJoint (ratio). PulleyJoint ratio is fixed at construction — no editable fields. Revolute, Weld, Prismatic have no editable parameters.
- `SelectTool` listens to `remove-joint` event to clear dangling `selectedJoint` reference when a body deletion auto-destroys its joints.

### 6. World Settings Panel ✓
Separate panel (floats on left side of canvas), toggled by "⚙ World" button in top bar:
- Gravity X / Y fields + "Gravity Off" checkbox (zeroes gravity without changing field values)
- Allow Sleep, Continuous Physics, Sub-stepping checkboxes (applied live via world methods)
- Time Step, Velocity Iterations, Position Iterations fields
- Field Size section: enable checkbox + radius field; on pause, non-static bodies beyond radius are teleported to a random non-overlapping position within the current view (50 attempts, fallback to center)
- Electromagnetic section: Wire Depth, Max Distance, Min Distance clamp
- Collapsible "Expert" section: 8 `planck.Settings` tolerance fields + "Reset to Defaults" button

### 11. Force Link ✓
Pairwise power-law force interaction between two bodies, managed like a joint (rendered, selectable, deletable, serialized, undo/redo).

- **Force law:** `F = k · (r − L₀)^n` along centroid-to-centroid unit vector; positive k = attractive
- **Parameters:** coefficient k, exponent n (−2 = gravity-like, 1 = spring), rest length L₀, minDistance clamp, maxDistance cutoff (0 = no limit)
- **Placement:** `ForceLinkTool` two-phase click flow (click Body A → click Body B); sidebar "Forces" group
- **Rendering:** dashed purple line between centroids, midpoint "ƒ" marker; selected link turns green
- **Selection:** midpoint hit-test in SelectTool (higher priority than joint anchors); `onForceLinkSelect` callback shows properties panel
- **Properties panel:** all 5 parameters editable; in-panel delete button
- **Deletion:** Delete key or in-panel button; removes from `forceLinks[]` array; body deletion auto-removes referencing links via `remove-body` hook
- **Serialization:** `forceLinks?: SerializedForceLink[]` in SceneFile; bodies stored by index in `buildBodyList()` order; round-trips correctly through undo/redo, Copy/Load, and `?scene=` URL
- **Simulation:** `applyForceLinks(forceLinks)` called before each `world.step()`; edge cases handled (r=0, effective≤0 with n<0, beyond maxDistance)

## Completed (continued)

### 6. Serialization ✓
- Custom `planck.Serializer` instance with postSerialize/postDeserialize hooks injects and restores `pkUserData` (color, shapeKind, collision sound, EM props) on each body.
- Scene file format: `{ version, settings, physics }` — world settings travel with the scene.
- Browser mode: 📋 Copy / 📂 Load buttons in top bar use the clipboard API.
- Browser mode: `?scene=<url>` GET parameter fetches and loads a scene on startup.
- Scene files live in `public/scenes/` so Vite serves them as static assets.

### 7. Collision Sound System ✓
- Web Audio API, pure oscillator tones (no audio files).
- Triggered in `world.on('begin-contact')` callback.
- Per-body settings already in userData: `{ enabled, frequencyHz, volume, durationMs }`.

### 8. Electromagnetic Forces ✓
Applied each simulation step via `applyEmForces()` in `src/physics/emForces.ts`, called before `world.step()`.

- `simTime` accumulates during play; reset to 0 on scene load/reset/undo/redo.
- Per-body inductive runtime state (`I`, `dIdt_prev`) lives in `Map<Body, EmBodyState>`; cleared on world change.
- Default `emDepth` = 100 m (approximates infinite-wire behaviour for typical scene sizes).
- Force equations compute total force (force-per-unit-length × l); units verified to reduce to N.

### 9. Collide Connected on Joints ✓
- `Collide Connected` checkbox added to the top of every joint's properties panel.
- Joints that previously had no editable fields (revolute, weld, prismatic, pulley) now show this field.
- Writes directly to `joint.m_collideConnected`; planck.js contact filter picks it up on the next contact evaluation.

### 10. Bug fixes ✓
- **Canvas/world coordinate mismatch (27 px Y offset):** `resizeCanvas()` ran before the status bar rendered, setting `canvas.height = 882` while the displayed height was 855. `window.resize` never fired to correct it. Fixed by replacing `window.addEventListener('resize', resizeCanvas)` with `new ResizeObserver(resizeCanvas).observe(canvas)`, which fires for any layout change including internal shifts.
- **World Settings panel requires two clicks to open:** `isVisible()` checks `style.display !== 'none'`, but the initial inline style is `''` not `'none'`, so the first click always hid rather than showed the panel. Fixed by calling `this.hide()` in the `WorldSettingsPanel` constructor to seed the inline style, matching the pattern used by `PropertiesPanel`.

## Notes
- Do NOT rebuild panel DOM every frame (breaks color pickers). Build once on selection; update `.value` only for live fields.
- All UI distances (handle sizes, hit zones, snap thresholds) are in pixels, not world units.
- `body.getWorldCenter()` does not exist in this planck.js build — use `body.getPosition()`.
- Always seed panel visibility via `this.hide()` in the constructor so `isVisible()` works correctly from the first interaction.
