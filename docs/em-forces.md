# Electromagnetic Force Model

## Geometry
- Simulation is 2D (x-y plane); z-direction is translationally invariant
- Global parameter `depth` (meters, set in World Settings) is the out-of-plane wire length `l`
- All EM forces act on body centroids — no EM torque
- No Lorentz cross-coupling: v × B is out-of-plane for in-plane motion, contributing nothing to 2D dynamics

## Per-Body EM Properties
- `lambda` — linear charge density λ (C/m)
- `currentType` — `fixed` | `sinusoidal` | `inductive`
- `current` — current I (A); for sinusoidal: amplitude I₀ (A), frequency f (Hz), phase φ (degrees)
- `resistance` — wire resistance R (Ω); **inductive bodies only** (not shown in panel for fixed/sinusoidal)
- `wireDiameter` — wire diameter d (meters); used in self-inductance formula; **inductive bodies only**
- Inductive bodies also have an optional series voltage source: amplitude V₀ (V), frequency f_v (Hz), phase φ_v (degrees)

## Force Laws
Both forces act along the centroid-to-centroid unit vector r̂. r is clamped to emMinDistance; pairs beyond emMaxDistance are skipped.

```
F_electric = λ₁λ₂ l / (2πε₀ r)    — same sign → repulsive
F_magnetic  = μ₀ I₁I₂ l / (2π r)  — same direction → attractive
```

## Inductance Formulas
Wire length l = simulation depth (global setting).

```
Self-inductance:    L_i  = μ₀l/(2π) · (ln(2l/d) - 3/4)    d = wireDiameter
Mutual inductance:  M_ij = μ₀l/(2π) · (ln(2l/r) - 1)       r = clamped centroid distance
```

## Current Update (per timestep)

### Fixed
```
dI/dt = 0
```

### Sinusoidal
```
I(t)  = I₀ · sin(2π f t  +  φ · π/180)
dI/dt = I₀ · 2πf · cos(2π f t  +  φ · π/180)
```

### Inductive (explicit ODE integration)
```
dM_ij/dt = -μ₀l/(2π) · (1/r_ij) · ṙ_ij       ṙ_ij = radial component of relative velocity

V_series(t) = V₀ · sin(2π f_v t  +  φ_v · π/180)    (0 if no voltage source configured)

E_i = V_series(t)  -  Σⱼ≠ᵢ [ (dM_ij/dt)·Iⱼ + M_ij·(dIⱼ/dt) ]

dI_i/dt = (E_i - R_i·I_i) / L_i
```

`dIⱼ/dt` for inductive body j uses the value from the previous timestep (explicit approximation).
**Note in code**: an exact solution would solve an (n_inductive × n_inductive) linear system each timestep instead of using the previous-step values.

With V₀ = 0 the body is purely passive (responds to neighbours' fields only).
With V₀ > 0 it is a driven oscillator and also acts as a source of magnetic field.
