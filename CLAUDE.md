# Physics Simulator Project

## Vision
An open-source interactive 2D physics sandbox inspired by Physion, with added electromagnetic simulation capabilities.

## Tech Stack
- JavaScript/TypeScript
- planck.js (v1) for rigid body physics
- HTML5 Canvas for rendering
- Tauri (v2) for desktop packaging

## Key Design Goals
- Clean, human-readable, well-documented code (this is an open-source project)
- Named constants, no magic numbers, clear variable names reflecting physics concepts
- Modular architecture: separate modules for rendering, UI, physics, and each force type
- TypeScript for self-documenting type safety

## World Event Hooks
- `world.on('begin-contact', ...)` — triggers collision sounds
- `world.on('remove-body', ...)` — cleans up any application-level references to deleted bodies
- `world.on('remove-joint', ...)` — triggers cascade deletion of any GearJoint that references the removed joint

## General UI Interaction Rules
- Any selectable or interactive target changes color when hovered, providing implicit feedback about what is valid
- If a target is not valid in the current context (e.g. hovering a non-revolute/prismatic joint while placing a GearJoint), it does not highlight, communicating non-selectability without error messages
- This applies to: bodies, joint handles, vertex handles, rotation handles, and any other interactive element
- Status bar at the bottom of the canvas displays contextual instructions for the current tool and step
- Ctrl held during placement snaps to nearest body center or edge (applies to joints and shape vertices)
- Visibility toggles (checkboxes): Hide bodies, Hide joints
  - While a joint placement tool is active, bodies are always shown regardless of the hide toggle; the hide bodies checkbox is grayed out until the tool is deactivated
- Play/pause/reset controls

## Camera and Zoom
- The canvas has a zoomable, pannable camera — the world scale is not fixed
- Zoom is centered on the mouse position (the world point under the cursor stays fixed)
- Pan by middle-mouse drag or similar gesture
- UI interaction distances (handle sizes, dead zones, snap distances, click targets) are always in pixels, not world units, so they remain consistent regardless of zoom level

## planck.js Notes
- `body.getWorldCenter()` does not exist in this build — use `body.getPosition()`

## Detail Files
For detailed specifications, read the relevant file before implementing:

| Topic | File |
|-------|------|
| Body placement, property panel fields, body editing handles | `docs/ui-body.md` |
| Joint placement steps, visualization symbols, editing, deletion | `docs/joints.md` |
| World Settings panel fields (physics + EM) | `docs/world-settings.md` |
| Serialization approach and hooks | `docs/serialization.md` |
| Collision sound system | `docs/sound.md` |
| Electromagnetic force model (forces, inductance, inductive current update) | `docs/em-forces.md` |
