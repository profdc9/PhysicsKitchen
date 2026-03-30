# Physics Simulator Project

## Vision
An open-source interactive 2D physics sandbox inspired by Physion, with added electromagnetic simulation capabilities.

## Tech Stack
- JavaScript/TypeScript
- planck.js (v1) for rigid body physics
- HTML5 Canvas for rendering
- Tauri (v2) for desktop packaging

## World Event Hooks
The following planck.js world events are used by the application:
- `world.on('begin-contact', ...)` — triggers collision sounds
- `world.on('remove-body', ...)` — cleans up any application-level references to deleted bodies
- `world.on('remove-joint', ...)` — triggers cascade deletion of any GearJoint that references the removed joint

## Sound
- Collision sounds are generated via the Web Audio API (no audio files needed, pure oscillator tones)
- Each body can have a collision sound enabled with configurable frequency, volume, and duration
- Sound is triggered in the planck.js beginContact collision callback
- Frequency can be entered as raw Hz or selected via a musical note picker (e.g. A4 = 440 Hz)
- Sound properties are stored in body userData alongside other custom properties

## Key Design Goals
- Clean, human-readable, well-documented code (this is an open-source project)
- Named constants, no magic numbers, clear variable names reflecting physics concepts
- Modular architecture: separate modules for rendering, UI, physics, and each force type
- TypeScript for self-documenting type safety

## Physics Features
- Standard Box2D rigid body mechanics (collisions, friction, gravity, joints)
- Custom force layer applied each simulation step:
  - Electrostatic (Coulomb's law) with charge properties per object
  - Magnetic dipole interactions with torque
  - Sinusoidal current sources for motor modeling
- Forces should emerge from real equations, not special cases

## Serialization
- Simulation state must be fully serializable to/from JSON
- Saved files should be human-readable text (shareable, version-controllable)
- Serialized state includes: all bodies (shape, position, velocity, mass, charge, magnetic properties), joints, and global settings (gravity, etc.)
- When running in a browser: load/save state via the clipboard (copy/paste JSON)
- When running in a browser: simulation state can be loaded from a remote URL, passed as a GET parameter in the page URL (e.g. `?scene=https://...`)
- Use planck.js built-in Serializer as the base (handles all physics state automatically):
  - Serializer.toJson(world) serializes bodies, fixtures, joints, positions, velocities
  - Serializer.fromJson(json) reconstructs the world
  - Use postSerialize hook to inject custom userData (collision sounds, EM properties, etc.) into each serialized body/fixture
  - Use postDeserialize hook to restore userData when loading
  - This means we only need to write serialization code for our own custom properties, not the physics state

## UI Features
- Toolbar for selecting which object type to place:
  - Circle
  - Box
  - Polygon
  - Edge (single line segment, static terrain)
  - Chain (connected line segments, static terrain)
- Object placement interactions:
  - Circle: click to set center, drag to set radius
  - Box: click one corner, drag to opposite corner
  - Edge: click start point, drag to end point
  - Polygon: click to place each vertex; close by pressing Enter or clicking near the first vertex; Backspace removes the last vertex
  - Chain: click to place each vertex; finish by pressing Enter or double-clicking; Backspace removes the last vertex; does not need to close
- While drawing Polygon and Chain, render a live preview:
  - Placed vertices connected by solid lines
  - Dashed line from the last placed vertex to the current mouse position
  - For Polygon, also show a dashed line from the current mouse position back to the first vertex, previewing the closing segment
- Property panel when a body is selected:
  - Type (dropdown: static / kinematic / dynamic)
  - Friction (slider + text field, range [0, 1])
  - Restitution (slider + text field, range [0, 1])
  - Density (text field, kg/m²)
  - Linear Damping (number field)
  - Angular Damping (number field)
  - Gravity Scale (number field; 0 = weightless, 1 = normal, -1 = floats up)
  - Fixed Rotation (checkbox)
  - Bullet (checkbox — enables continuous collision for fast-moving bodies)
  - Linear Velocity X/Y (number fields — sets initial velocity)
  - Angular Velocity (number field — sets initial angular velocity in rad/s)
  - Allow Sleep (checkbox)
  - Active (checkbox — whether body participates in simulation)
  - Collision Sound section:
    - Enabled checkbox
    - Frequency field (Hz) with a musical note picker alongside (e.g. "A4 = 440 Hz") — only shown when enabled
    - Volume slider + text field (range [0, 1]) — only shown when enabled
    - Duration field (milliseconds) — only shown when enabled
  - Collapsible "Advanced" section (hidden by default):
    - Collision layers: filterCategoryBits and filterMaskBits as checkboxes (Layer 1–8)
    - filterGroupIndex as a raw integer field
- Joint placement:
  - RevoluteJoint placement is a 3-step process guided by the status bar:
    1. "Click to place joint anchor (hold Ctrl to snap to body center or edge)"
    2. "Click the first body to connect"
    3. "Click the second body to connect"
  - Ctrl-snap applies during anchor placement only; body selection is always a direct click
  - Snapping applies to: body centers, body edges
  - WeldJoint placement is identical to RevoluteJoint (3-step: anchor, first body, second body) but renders as an X at the anchor point
  - PrismaticJoint placement is a 4-step process guided by the status bar:
    1. "Click to place joint anchor (hold Ctrl to snap to body center or edge)"
    2. "Drag to set the sliding axis (hold Shift to snap to 45° increments)"
    3. "Click the first body to connect"
    4. "Click the second body to connect"
  - Shift snaps the axis angle to 0°, 45°, 90°, 135°, etc.
  - DistanceJoint placement is a 2-step process guided by the status bar:
    1. "Click to place anchor on first body (hold Ctrl to snap to body center or edge)"
    2. "Click to place anchor on second body (hold Ctrl to snap to body center or edge)"
  - A dashed line stretches from the first anchor to the mouse cursor during step 2
  - Distance is automatically set from the positions at placement time, editable in properties panel
  - DistanceJoint properties panel exposes: length, frequencyHz (spring frequency, 0 = rigid), dampingRatio (0 = no damping, 1 = critical damping)
  - Once placed, the joint renders as a solid line between the two anchor points
  - RopeJoint placement is identical to DistanceJoint (2-step: anchor on first body, anchor on second body) with dashed line preview
  - PulleyJoint placement is a 4-step process guided by the status bar:
    1. "Click to place anchor on first body (hold Ctrl to snap)"
    2. "Click to place anchor on second body (hold Ctrl to snap)" — dashed line from anchorA to cursor
    3. "Click to place first pulley (hold Ctrl to snap)" — dashed lines from anchorA to cursor and cursor to anchorB
    4. "Click to place second pulley (hold Ctrl to snap)" — dashed lines from anchorA to groundAnchorA and groundAnchorA to cursor and cursor to anchorB
  - PulleyJoint properties panel exposes: ratio (block-and-tackle multiplier, default 1)
  - GearJoint placement is a 2-step process guided by the status bar:
    1. "Click the first joint to connect (RevoluteJoint or PrismaticJoint)" — only valid joint types highlight on hover
    2. "Click the second joint to connect (RevoluteJoint or PrismaticJoint)" — only valid joint types highlight on hover
  - GearJoint renders as a dashed line between the two linked joint symbols with a small gear icon at the midpoint
  - GearJoint properties panel exposes: ratio (default 1, can be negative)
  - WheelJoint placement is a 4-step process guided by the status bar (same as PrismaticJoint):
    1. "Click to place joint anchor (hold Ctrl to snap to body center or edge)"
    2. "Drag to set the suspension axis (hold Shift to snap to 45° increments)"
    3. "Click the first body to connect (chassis)"
    4. "Click the second body to connect (wheel)"
  - WheelJoint properties panel exposes: frequencyHz (suspension spring, 0 = rigid), dampingRatio, enableMotor (checkbox), motorSpeed (rad/s), maxMotorTorque (N-m)
  - maxLength defaults to the distance between anchors at placement time; properties panel exposes maxLength as an editable numeric field (editable live during simulation)
  - RopeJoint renders as knot-and-segment rope; droops when slack, straightens when taut
  - FrictionJoint placement is a 3-step process guided by the status bar (same as RevoluteJoint/WeldJoint):
    1. "Click to place joint anchor (hold Ctrl to snap to body center or edge)"
    2. "Click the first body to connect"
    3. "Click the second body to connect"
  - FrictionJoint properties panel exposes: maxForce (N), maxTorque (N-m)
  - MotorJoint placement is a 2-step process guided by the status bar (no anchor point):
    1. "Click the first body"
    2. "Click the second body"
  - MotorJoint properties panel exposes: linearOffset (Vec2, meters), angularOffset (radians), maxForce (N), maxTorque (N-m), correctionFactor ([0,1])

## Body Editing Handles
When a body is selected, its defining handles appear for reshaping, consistent with the creation interaction:
- **Circle** — center handle (drag to move) + radius edge handle (drag to resize)
- **Box** — two opposite corner handles (drag either to resize)
- **Edge** — two endpoint handles (drag to reposition either end)
- **Polygon** — one handle per vertex (drag to reposition); future: add/remove vertices
- **Chain** — one handle per vertex (drag to reposition)

Dragging anywhere on a body's interior (not on a handle) moves the whole body without reshaping it.

Each body type except Circle has a **rotation handle**: a small handle offset above the body's center. Dragging it rotates the entire body.
- The rotation handle has a **dead zone**: rotation only begins once the mouse has moved a minimum distance from the initial click position, preventing wild snapping when first grabbed
- Shift held during rotation snaps to 45° increments

## Camera and Zoom
- The canvas has a zoomable, pannable camera — the world scale is not fixed
- Zoom is centered on the mouse position (the world point under the cursor stays fixed)
- Pan by middle-mouse drag or similar gesture
- UI interaction distances (handle sizes, dead zones, snap distances, click targets) are always in pixels, not world units, so they remain consistent regardless of zoom level

## General UI Interaction Rules
- Any selectable or interactive target changes color when hovered, providing implicit feedback about what is valid
- If a target is not valid in the current context (e.g. hovering a non-revolute/prismatic joint while placing a GearJoint), it does not highlight, communicating non-selectability without error messages
- This applies to: bodies, joint handles, vertex handles, rotation handles, and any other interactive element

## Joint Deletion Rules
- When a joint is deleted, any GearJoint that references it must also be automatically deleted
- This must be enforced by the application (planck.js does not handle this automatically)

## Joint Visualization
Each joint type has a distinct visual symbol used both on the canvas and on the toolbar button, so the user associates the symbol with the joint type:
- **RevoluteJoint** — ⊕ circle with crosshair (suggests rotation around a point)
- **PrismaticJoint** — ⇔ rectangle on a line with axis arrows (suggests sliding)
- **DistanceJoint (rigid)** — solid line with small circles at each end (suggests a rod)
- **DistanceJoint (spring, frequencyHz > 0)** — zigzag/coil line between anchors (suggests a spring)
- **WeldJoint** — ✕ filled X (suggests locked/fused)
- **RopeJoint** — knotted segments with filled circles at intervals; droops with catenary/bezier curve when slack, straightens when taut
- **PulleyJoint** — lines from each body anchor up to its ground anchor, horizontal bar connecting the two ground anchors with a circle (pulley wheel) at each
- **GearJoint** — dashed line between the two linked joint symbols with a ⚙ gear icon at midpoint
- **WheelJoint** — circle (wheel) with a perpendicular spring line above it (suggests suspension)
- **FrictionJoint** — ✦ four-pointed arrow (suggests resistance in all directions)
- **MotorJoint** — ↻ circle with curved arrow (suggests driven rotation)

## Joint Editing
- Joint anchor points are rendered as distinct colored handles (e.g. yellow) to distinguish them from body handles
- Clicking a joint handle selects the joint and opens its properties panel
- Selecting a joint also highlights the joint and its connected bodies
- Joint anchor handles are draggable to reposition them, using the same snapping rules as placement (Ctrl to snap to body center/edge)
- For PrismaticJoint, the axis endpoint is also draggable to redefine the axis direction (Shift to snap to 45°)
- Joint visualizations are always visible, both during play and when paused
- Joint anchor positions are obtained each frame via joint.getAnchorA() and joint.getAnchorB() (world coordinates), so visualizations automatically track moving bodies
- Status bar at the bottom of the canvas:
  - Displays contextual instructions for the current tool and step
  - Used for all multi-step interactions (joint placement, polygon/chain drawing, etc.)
- Ctrl held during placement snaps to nearest body center or edge (applies to joints and shape vertices)
- World Settings panel (separate from body properties panel):
  - Gravity X and Y fields (default 0, -9.8) with a "Gravity Off" checkbox that zeroes gravity without changing the field values, allowing it to be restored
  - Allow Sleep checkbox (default on) — inactive bodies sleep for performance
  - Continuous Physics checkbox (default on) — prevents fast objects tunneling through thin bodies
  - Sub-stepping checkbox (default off) — extra accuracy for fast simulations
  - Time Step field (default 1/60 seconds)
  - Velocity Iterations field — solver accuracy vs. performance
  - Position Iterations field — solver accuracy vs. performance
  - Collapsible "Expert" section with a warning: internal Settings tolerances (linearSlop, aabbExtension, etc.) — changing these may break the simulation
- Play/pause/reset controls
- Visibility toggles (checkboxes):
  - Hide bodies
  - Hide joints
  - While a joint placement tool is active, bodies are always shown regardless of the hide toggle; the hide bodies checkbox is grayed out until the tool is deactivated