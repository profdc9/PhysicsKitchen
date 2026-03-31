# Serialization

## Goals
- Simulation state must be fully serializable to/from JSON
- Saved files should be human-readable text (shareable, version-controllable)
- Serialized state includes: all bodies (shape, position, velocity, mass, charge, EM properties), joints, and global settings (gravity, EM settings, etc.)

## Approach
Use planck.js built-in Serializer as the base — it handles all physics state automatically:
- `Serializer.toJson(world)` serializes bodies, fixtures, joints, positions, velocities
- `Serializer.fromJson(json)` reconstructs the world
- Use **postSerialize hook** to inject custom userData (color, shapeKind, collision sound, EM properties) into each serialized body/fixture
- Use **postDeserialize hook** to restore userData when loading
- Only custom properties need explicit serialization code; physics state is handled automatically

## Browser Mode
- Load/save state via the clipboard (copy/paste JSON)
- Simulation state can be loaded from a remote URL passed as a GET parameter: `?scene=https://...`
