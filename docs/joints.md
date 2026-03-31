# Joint Placement, Visualization, and Editing

## Placement Interactions

### RevoluteJoint (3-step)
1. "Click to place joint anchor (hold Ctrl to snap to body center or edge)"
2. "Click the first body to connect"
3. "Click the second body to connect"
- Ctrl-snap applies during anchor placement only; body selection is always a direct click

### WeldJoint (3-step)
Identical to RevoluteJoint (anchor → body A → body B), but renders as an ✕ at the anchor point.

### PrismaticJoint (4-step)
1. "Click to place joint anchor (hold Ctrl to snap to body center or edge)"
2. "Drag to set the sliding axis (hold Shift to snap to 45° increments)"
3. "Click the first body to connect"
4. "Click the second body to connect"
- Shift snaps the axis angle to 0°, 45°, 90°, 135°, etc.

### DistanceJoint (2-step)
1. "Click to place anchor on first body (hold Ctrl to snap to body center or edge)"
2. "Click to place anchor on second body (hold Ctrl to snap to body center or edge)"
- A dashed line stretches from the first anchor to the mouse cursor during step 2
- Distance is automatically set from the positions at placement time, editable in properties panel
- Once placed, renders as a solid line between the two anchor points
- Properties panel: length, frequencyHz (spring frequency, 0 = rigid), dampingRatio (0 = no damping, 1 = critical damping)

### RopeJoint (2-step)
Identical to DistanceJoint (anchor on first body → anchor on second body) with dashed line preview.
- maxLength defaults to the distance between anchors at placement time; properties panel exposes maxLength as an editable numeric field (editable live during simulation)
- Renders as knot-and-segment rope; droops when slack, straightens when taut
- Properties panel: maxLength

### WheelJoint (4-step)
Same steps as PrismaticJoint (anchor → axis drag → body A → body B).
1. "Click to place joint anchor (hold Ctrl to snap to body center or edge)"
2. "Drag to set the suspension axis (hold Shift to snap to 45° increments)"
3. "Click the first body to connect (chassis)"
4. "Click the second body to connect (wheel)"
- Properties panel: frequencyHz (suspension spring, 0 = rigid), dampingRatio, enableMotor (checkbox), motorSpeed (rad/s), maxMotorTorque (N-m)

### FrictionJoint (3-step)
Same steps as RevoluteJoint/WeldJoint (anchor → body A → body B).
1. "Click to place joint anchor (hold Ctrl to snap to body center or edge)"
2. "Click the first body to connect"
3. "Click the second body to connect"
- Properties panel: maxForce (N), maxTorque (N-m)

### MotorJoint (2-step, no anchor)
1. "Click the first body"
2. "Click the second body"
- Properties panel: linearOffset (Vec2, meters), angularOffset (radians), maxForce (N), maxTorque (N-m), correctionFactor ([0,1])

### PulleyJoint (4-step)
1. "Click to place anchor on first body (hold Ctrl to snap)"
2. "Click to place anchor on second body (hold Ctrl to snap)" — dashed line from anchorA to cursor
3. "Click to place first pulley (hold Ctrl to snap)" — dashed lines from anchorA to cursor and cursor to anchorB
4. "Click to place second pulley (hold Ctrl to snap)" — dashed lines from anchorA to groundAnchorA, groundAnchorA to cursor, and cursor to anchorB
- Properties panel: ratio (block-and-tackle multiplier, default 1)

### GearJoint (2-step)
1. "Click the first joint to connect (RevoluteJoint or PrismaticJoint)" — only valid joint types highlight on hover
2. "Click the second joint to connect (RevoluteJoint or PrismaticJoint)" — only valid joint types highlight on hover
- Properties panel: ratio (default 1, can be negative)

## Visualization Symbols
Each joint type has a distinct visual symbol used both on the canvas and on the toolbar button:
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

## Editing
- Joint anchor points are rendered as distinct colored handles (e.g. yellow) to distinguish them from body handles
- Clicking a joint handle selects the joint and opens its properties panel
- Selecting a joint also highlights the joint and its connected bodies
- Joint anchor handles are draggable to reposition them, using the same snapping rules as placement (Ctrl to snap to body center/edge)
- For PrismaticJoint, the axis endpoint is also draggable to redefine the axis direction (Shift to snap to 45°)
- Joint visualizations are always visible, both during play and when paused
- Joint anchor positions are obtained each frame via joint.getAnchorA() and joint.getAnchorB() (world coordinates), so visualizations automatically track moving bodies

## Deletion Rules
- When a joint is deleted, any GearJoint that references it must also be automatically deleted
- This must be enforced by the application (planck.js does not handle this automatically)
- This is triggered by the `world.on('remove-joint', ...)` event hook
