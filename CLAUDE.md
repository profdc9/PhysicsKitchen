# Physics Simulator Project

## Vision
An open-source interactive 2D physics sandbox inspired by Physion, with added electromagnetic simulation capabilities.

## Tech Stack
- JavaScript/TypeScript
- planck.js (or box2d-wasm) for rigid body physics
- HTML5 Canvas for rendering
- Electron or Tauri for desktop packaging

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

## UI Features
- Drag-and-drop shape placement
- Property panels for physical and electromagnetic properties
- Play/pause/reset controls
- Toolbar for object selection