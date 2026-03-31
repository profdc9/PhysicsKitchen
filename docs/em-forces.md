# Electromagnetic Force Model

## Geometry
- Simulation is 2D (x-y plane); z-direction is translationally invariant
- Global parameter `depth` (meters, set in World Settings) is the out-of-plane wire length `l`
- All EM forces act on body centroids — no EM torque
- No Lorentz cross-coupling: v × B is out-of-plane for in-plane motion, contributing nothing to 2D dynamics

## Per-Body EM Properties
- `lambda` — linear charge density λ (C/m)
- `currentType` — `fixed` | `sinusoidal` | `inductive`
- `current` — current I (A); for sinusoidal: amplitude I₀, frequency ω (rad/s), phase φ (radians)
- `resistance` — wire resistance R (Ω); used in inductive current integration
- `wireDiameter` — wire diameter d (meters); used in self-inductance formula

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
I(t)  = I₀ sin(ωt + φ)
dI/dt = I₀ ω cos(ωt + φ)
```

### Inductive (explicit ODE integration)
```
dM_ij/dt = -μ₀l/(2π) · (1/r_ij) · ṙ_ij       ṙ_ij = radial component of relative velocity

E_i = -Σⱼ≠ᵢ [ (dM_ij/dt)·Iⱼ + M_ij·(dIⱼ/dt) ]

dI_i/dt = (E_i - R_i·I_i) / L_i
```

`dIⱼ/dt` for inductive body j uses the value from the previous timestep (explicit approximation).
**Note in code**: an exact solution would solve an (n_inductive × n_inductive) linear system each timestep instead of using the previous-step values.
