/**
 * Electromagnetic force simulation module.
 *
 * Models all bodies as infinitely-long wires extending depth l (meters) out of the 2D plane.
 * Forces are applied at body centroids (getPosition()); no EM torque is produced.
 *
 * Force laws — both 1/r, along the centroid-to-centroid unit vector r̂ (pointing from A to B):
 *
 *   F_electric = λ_A λ_B l / (2πε₀ r)   — same sign → repulsive (positive → push A away from B)
 *   F_magnetic = μ₀ I_A I_B l / (2π r)  — same direction → attractive (positive → pull A toward B)
 *
 * Net force scalar on A:  F_on_A = (-F_electric + F_magnetic)
 * (repulsive electric reverses the r̂ direction; attractive magnetic is along r̂)
 *
 * Inductive current update (explicit ODE per timestep):
 *   L_i      = μ₀l/(2π) · (ln(2l/d) − 3/4)
 *   M_ij     = μ₀l/(2π) · (ln(2l/r) − 1)
 *   dM_ij/dt = −μ₀l/(2π) · (1/r) · ṙ_ij          ṙ_ij = radial relative velocity
 *   E_i      = V_series(t) − Σ_j≠i [dM_ij/dt·I_j + M_ij·dI_j/dt]
 *   dI_i/dt  = (E_i − R_i·I_i) / L_i
 *   I_i     += dI_i/dt · dt
 *
 * Note: dI_j/dt for inductive body j uses the value from the previous timestep (explicit
 * approximation). An exact solution would solve an (n_inductive × n_inductive) linear system
 * each timestep instead.
 */

import * as planck from 'planck';
import { BodyUserData } from '../types/userData';
import { WorldSettings } from './world';

// ── Physical constants ────────────────────────────────────────────────────────

const EPSILON_0 = 8.854187817e-12;   // Permittivity of free space (F/m)
const MU_0      = 4 * Math.PI * 1e-7; // Permeability of free space (H/m)

// ── Runtime state ─────────────────────────────────────────────────────────────

/**
 * Per-body runtime EM state maintained between timesteps.
 * Only inductive bodies have entries here; fixed and sinusoidal currents are
 * computed analytically from userData and the current simulation time.
 */
export interface EmBodyState {
  /** Integrated current I (A) — updated each timestep via explicit Euler */
  I: number;
  /** dI/dt from the previous timestep — used as an explicit approximation for inductive coupling */
  dIdt_prev: number;
}

// ── Main entry point ──────────────────────────────────────────────────────────

/**
 * Apply electromagnetic forces between all EM-participating body pairs,
 * then update inductive body currents for the next timestep.
 *
 * Call this BEFORE world.step() each simulation frame.
 *
 * @param world     The planck.js world
 * @param settings  World settings (emDepth, emMaxDistance, emMinDistance)
 * @param simTime   Accumulated simulation time (seconds), used for sinusoidal phase
 * @param dt        Timestep size (seconds)
 * @param stateMap  Mutable runtime state for inductive bodies — persists across steps
 */
export function applyEmForces(
  world: planck.World,
  settings: WorldSettings,
  simTime: number,
  dt: number,
  stateMap: Map<planck.Body, EmBodyState>,
): void {
  const l     = settings.emDepth;
  const dMax  = settings.emMaxDistance;
  const dMin  = settings.emMinDistance;

  // ── Collect EM-active bodies ─────────────────────────────────────────────────

  const emBodies: Array<{ body: planck.Body; em: NonNullable<BodyUserData['em']> }> = [];
  for (let body = world.getBodyList(); body; body = body.getNext()) {
    const ud = body.getUserData() as BodyUserData | null;
    if (ud?.em) {
      emBodies.push({ body, em: ud.em });
    }
  }

  if (emBodies.length < 2) return;

  // ── Step 1: compute instantaneous current I and dI/dt for each EM body ───────

  const currents = new Map<planck.Body, number>(); // I(t) in amperes
  const dIdts    = new Map<planck.Body, number>(); // dI/dt in A/s

  for (const { body, em } of emBodies) {
    let I: number;
    let dIdt: number;

    if (em.currentType === 'fixed') {
      I    = em.current;
      dIdt = 0;

    } else if (em.currentType === 'sinusoidal') {
      const omega = 2 * Math.PI * em.frequencyHz;
      const phi   = em.phaseDeg * Math.PI / 180;
      I    = em.current * Math.sin(omega * simTime + phi);
      dIdt = em.current * omega * Math.cos(omega * simTime + phi);

    } else {
      // inductive — current is an integrated state variable
      let state = stateMap.get(body);
      if (!state) {
        // Initialise from the configured current value (initial condition)
        state = { I: em.current, dIdt_prev: 0 };
        stateMap.set(body, state);
      }
      I    = state.I;
      dIdt = state.dIdt_prev;
    }

    currents.set(body, I);
    dIdts.set(body,    dIdt);
  }

  // ── Step 2: apply electric and magnetic forces between all body pairs ─────────

  for (let i = 0; i < emBodies.length; i++) {
    const { body: bodyA, em: emA } = emBodies[i];
    const posA = bodyA.getPosition();
    const IA   = currents.get(bodyA)!;

    for (let j = i + 1; j < emBodies.length; j++) {
      const { body: bodyB, em: emB } = emBodies[j];
      const posB = bodyB.getPosition();
      const IB   = currents.get(bodyB)!;

      const dx   = posB.x - posA.x;
      const dy   = posB.y - posA.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist > dMax) continue;
      // Skip bodies at essentially the same position — direction vector is undefined
      if (dist < 1e-10) continue;

      const r  = Math.max(dist, dMin);      // clamped distance for force magnitude
      const nx = dx / dist;                 // unit vector from A toward B
      const ny = dy / dist;

      // Electric force scalar (positive → repulsive, so force on A is in −r̂ direction)
      const fElec = emA.lambda * emB.lambda * l / (2 * Math.PI * EPSILON_0 * r);

      // Magnetic force scalar (positive → attractive, so force on A is in +r̂ direction)
      const fMag = MU_0 * IA * IB * l / (2 * Math.PI * r);

      // Net signed force on A along r̂: negative electric (pushes away) + positive magnetic (pulls in)
      const fOnA = -fElec + fMag;

      if (bodyA.getType() !== 'static') {
        bodyA.applyForce(planck.Vec2(fOnA * nx, fOnA * ny), posA);
      }
      if (bodyB.getType() !== 'static') {
        // Reaction force on B is equal and opposite
        bodyB.applyForce(planck.Vec2(-fOnA * nx, -fOnA * ny), posB);
      }
    }
  }

  // ── Step 3: update inductive body currents via explicit Euler integration ─────

  const inductiveBodies = emBodies.filter(({ em }) => em.currentType === 'inductive');
  if (inductiveBodies.length === 0) return;

  for (const { body: bodyI, em: emI } of inductiveBodies) {
    const state = stateMap.get(bodyI)!;
    const posI  = bodyI.getPosition();
    const velI  = bodyI.getLinearVelocity();

    // Self-inductance: L_i = μ₀l/(2π) · (ln(2l/d) − 3/4)
    const L_i = MU_0 * l / (2 * Math.PI) * (Math.log(2 * l / emI.wireDiameter) - 0.75);
    if (L_i <= 0) continue; // degenerate (wireDiameter ≥ 2l·e^(3/4) ≈ 4.2l)

    // Series voltage source contribution
    const omegaV  = 2 * Math.PI * emI.seriesFvHz;
    const phiV    = emI.seriesPhiVDeg * Math.PI / 180;
    const vSeries = emI.seriesV0 * Math.sin(omegaV * simTime + phiV);

    // Accumulate mutual-inductance back-EMF from all other EM bodies
    let EMF = vSeries;

    for (const { body: bodyJ } of emBodies) {
      if (bodyJ === bodyI) continue;

      const posJ  = bodyJ.getPosition();
      const velJ  = bodyJ.getLinearVelocity();
      const dx    = posJ.x - posI.x;
      const dy    = posJ.y - posI.y;
      const dist  = Math.sqrt(dx * dx + dy * dy);

      if (dist > dMax) continue;
      if (dist < 1e-10) continue;

      const r  = Math.max(dist, dMin);
      const nx = dx / dist;
      const ny = dy / dist;

      // Mutual inductance: M_ij = μ₀l/(2π) · (ln(2l/r) − 1)
      const M_ij = MU_0 * l / (2 * Math.PI) * (Math.log(2 * l / r) - 1);

      // Time derivative of mutual inductance: dM_ij/dt = −μ₀l/(2π) · (1/r) · ṙ_ij
      // ṙ_ij is the radial component of the velocity of j relative to i (positive = separating)
      const relVx  = velJ.x - velI.x;
      const relVy  = velJ.y - velI.y;
      const rDot   = relVx * nx + relVy * ny;
      const dM_dt  = -MU_0 * l / (2 * Math.PI) * (1 / r) * rDot;

      const I_j    = currents.get(bodyJ)!;
      const dIdt_j = dIdts.get(bodyJ)!;

      // Back-EMF contribution from this neighbour
      EMF -= dM_dt * I_j + M_ij * dIdt_j;
    }

    // dI_i/dt = (EMF − R_i · I_i) / L_i
    const newDIdt = (EMF - emI.resistance * state.I) / L_i;

    // Explicit Euler: I_i(t+dt) = I_i(t) + dI_i/dt · dt
    state.I        += newDIdt * dt;
    state.dIdt_prev = newDIdt;
  }
}
