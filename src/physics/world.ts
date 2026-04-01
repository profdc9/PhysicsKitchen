import * as planck from 'planck';
import { BodyUserData } from '../types/userData';

// Default simulation parameters
const DEFAULT_GRAVITY_X = 0;
const DEFAULT_GRAVITY_Y = -9.8;
const DEFAULT_TIME_STEP = 1 / 60;
const DEFAULT_VELOCITY_ITERATIONS = 8;
const DEFAULT_POSITION_ITERATIONS = 3;

export interface WorldSettings {
  gravityX: number;
  gravityY: number;
  gravityEnabled: boolean;
  allowSleep: boolean;
  continuousPhysics: boolean;
  subStepping: boolean;
  timeStep: number;
  velocityIterations: number;
  positionIterations: number;
  // Field size: bodies farther from origin than this radius are relocated on pause
  fieldSizeEnabled: boolean;
  fieldSize: number;      // radius in meters; 0 = disabled
  // Electromagnetic simulation parameters (used when EM forces are active)
  emDepth: number;        // out-of-plane wire length l (m); scales EM forces and inductance
  emMaxDistance: number;  // body pairs farther than this skip EM calculations (performance knob)
  emMinDistance: number;  // r is clamped to at least this value in all EM formulas (avoid divergence)
}

export const DEFAULT_WORLD_SETTINGS: WorldSettings = {
  gravityX: DEFAULT_GRAVITY_X,
  gravityY: DEFAULT_GRAVITY_Y,
  gravityEnabled: true,
  allowSleep: true,
  continuousPhysics: true,
  subStepping: false,
  timeStep: DEFAULT_TIME_STEP,
  velocityIterations: DEFAULT_VELOCITY_ITERATIONS,
  positionIterations: DEFAULT_POSITION_ITERATIONS,
  fieldSizeEnabled: false,
  fieldSize: 100,
  emDepth: 1.0,
  emMaxDistance: 50.0,
  emMinDistance: 0.01,
};

export class PhysicsWorld {
  readonly world: planck.World;
  private settings: WorldSettings;
  private onCollisionCallbacks: Array<(contact: planck.Contact) => void> = [];

  constructor(settings: WorldSettings = DEFAULT_WORLD_SETTINGS) {
    this.settings = { ...settings };

    this.world = new planck.World({
      gravity: planck.Vec2(
        settings.gravityEnabled ? settings.gravityX : 0,
        settings.gravityEnabled ? settings.gravityY : 0
      ),
      allowSleep: settings.allowSleep,
      continuousPhysics: settings.continuousPhysics,
      subStepping: settings.subStepping,
    });

    this.registerEventHooks();
  }

  /**
   * Wrap an existing planck.js World (e.g. one restored from a snapshot)
   * in a new PhysicsWorld, re-registering all event hooks on it.
   */
  static fromWorld(existingWorld: planck.World, settings: WorldSettings = DEFAULT_WORLD_SETTINGS): PhysicsWorld {
    const pw = Object.create(PhysicsWorld.prototype) as PhysicsWorld;
    (pw as any).world = existingWorld;
    (pw as any).settings = { ...settings };
    (pw as any).onCollisionCallbacks = [];
    pw['registerEventHooks']();
    return pw;
  }

  private registerEventHooks(): void {
    // Trigger collision sounds
    this.world.on('begin-contact', (contact) => {
      for (const callback of this.onCollisionCallbacks) {
        callback(contact);
      }
    });

    // Cascade-delete any GearJoint that references a removed joint
    this.world.on('remove-joint', (removedJoint) => {
      const toRemove: planck.Joint[] = [];

      for (let joint = this.world.getJointList(); joint; joint = joint.getNext()) {
        if (joint.getType() === 'gear-joint') {
          const gear = joint as planck.GearJoint;
          if (gear.getJoint1() === removedJoint || gear.getJoint2() === removedJoint) {
            toRemove.push(gear);
          }
        }
      }

      for (const gear of toRemove) {
        this.world.destroyJoint(gear);
      }
    });
  }

  /** Advance the simulation by one time step. */
  step(): void {
    this.world.step(
      this.settings.timeStep,
      this.settings.velocityIterations,
      this.settings.positionIterations
    );
  }

  /** Register a callback to be called when two bodies begin contact. */
  onCollision(callback: (contact: planck.Contact) => void): void {
    this.onCollisionCallbacks.push(callback);
  }

  /** Apply updated world settings. */
  applySettings(settings: Partial<WorldSettings>): void {
    this.settings = { ...this.settings, ...settings };

    const gravityX = this.settings.gravityEnabled ? this.settings.gravityX : 0;
    const gravityY = this.settings.gravityEnabled ? this.settings.gravityY : 0;
    this.world.setGravity(planck.Vec2(gravityX, gravityY));

    if ('allowSleep'        in settings) (this.world as any).setAllowSleeping(this.settings.allowSleep);
    if ('continuousPhysics' in settings) (this.world as any).setContinuousPhysics(this.settings.continuousPhysics);
    if ('subStepping'       in settings) (this.world as any).setSubStepping(this.settings.subStepping);
  }

  getSettings(): WorldSettings {
    return { ...this.settings };
  }
}
