# Body Placement, Property Panel, and Editing Handles

## Toolbar Shape Types
- Circle
- Box
- Polygon
- Edge (single line segment, static terrain)
- Chain (connected line segments, static terrain)

## Placement Interactions
- **Circle**: click to set center, drag to set radius
- **Box**: click one corner, drag to opposite corner
- **Edge**: click start point, drag to end point
- **Polygon**: click to place each vertex; close by pressing Enter or clicking near the first vertex; Backspace removes the last vertex
- **Chain**: click to place each vertex; finish by pressing Enter or double-clicking; Backspace removes the last vertex; does not need to close

### Live Preview (Polygon and Chain)
- Placed vertices connected by solid lines
- Dashed line from the last placed vertex to the current mouse position
- For Polygon: also show a dashed line from the current mouse position back to the first vertex, previewing the closing segment

## Property Panel (shown on right when a body is selected)
- Color (color picker)
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

### Collision Sound Section
- Enabled checkbox
- Frequency field (Hz) with a musical note picker alongside (e.g. "A4 = 440 Hz") — only shown when enabled
- Volume slider + text field (range [0, 1]) — only shown when enabled
- Duration field (milliseconds) — only shown when enabled

### EM Properties Section
- Lambda λ (linear charge density, C/m)
- Current type (dropdown: fixed / sinusoidal / inductive)
- Current (A) — shown for fixed; amplitude I₀ (A) for sinusoidal
- Frequency f (Hz) and Phase φ (degrees) — shown for sinusoidal only
- **Inductive-only fields** (hidden for fixed/sinusoidal):
  - Resistance R (Ω)
  - Wire diameter d (meters) — used for self-inductance
  - Series voltage source: amplitude V₀ (V), frequency f_v (Hz), phase φ_v (degrees)
    — models a series oscillating voltage in the current loop; V₀ = 0 means purely passive

### Collapsible "Advanced" Section (hidden by default)
- Collision layers: filterCategoryBits and filterMaskBits as checkboxes (Layer 1–8)
- filterGroupIndex as a raw integer field

## Body Editing Handles
When a body is selected, its defining handles appear for reshaping:
- **Circle** — center handle (drag to move) + radius edge handle (drag to resize)
- **Box** — two opposite corner handles (drag either to resize)
- **Edge** — two endpoint handles (drag to reposition either end)
- **Polygon** — one handle per vertex (drag to reposition); future: add/remove vertices
- **Chain** — one handle per vertex (drag to reposition)

Dragging anywhere on a body's interior (not on a handle) moves the whole body without reshaping it.

### Rotation Handle
Each body type except Circle has a rotation handle: a small handle offset above the body's center.
- Dragging it rotates the entire body
- Dead zone: rotation only begins once the mouse has moved a minimum distance from the initial click position, preventing wild snapping when first grabbed
- Shift held during rotation snaps to 45° increments
