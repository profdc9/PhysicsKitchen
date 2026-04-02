# World Settings Panel

Separate panel (not body-specific), always accessible.

## Physics Settings
- Gravity X and Y fields (default 0, -9.8) with a "Gravity Off" checkbox that zeroes gravity without changing the field values, allowing it to be restored
- Allow Sleep checkbox (default on) — inactive bodies sleep for performance
- Continuous Physics checkbox (default on) — prevents fast objects tunneling through thin bodies
- Sub-stepping checkbox (default off) — extra accuracy for fast simulations
- Time Step field (default 1/60 seconds)
- Velocity Iterations field — solver accuracy vs. performance
- Position Iterations field — solver accuracy vs. performance

### Collapsible "Expert" Section
Warning displayed: "Changing these may break the simulation."
- Internal solver tolerances: linearSlop, aabbExtension, and other planck.js Settings fields

## Electromagnetic Settings
- `depth` — out-of-plane wire length l (meters); used in all EM force and inductance formulas; default 100 m (much larger than typical world size to approximate infinite-wire behaviour)
- `emMaxDistance` — cutoff radius; body pairs farther apart than this skip EM calculations entirely (performance knob)
- `emMinDistance` — clamp; r is treated as at least this value in all EM formulas to avoid divergence at close range (applies to force calculations and inductance formulas)
