import * as planck from 'planck';
import { WorldSettings } from './world';
import { BodyUserData } from '../types/userData';
import { ForceLink } from './forceLinks';

/** Serialized representation of a ForceLink (bodies stored as world-list indices). */
interface SerializedForceLink {
  bodyA: number;
  bodyB: number;
  coefficient: number;
  exponent: number;
  restLength: number;
  minDistance: number;
  maxDistance: number;
}

/** Versioned JSON envelope for saved scenes. */
interface SceneFile {
  version: number;
  settings: WorldSettings;
  physics: planck.SerializedType;
  forceLinks?: SerializedForceLink[];
}

const FILE_VERSION = 1;

/**
 * Custom planck.js Serializer that injects and restores BodyUserData
 * (color, shapeKind, collision sound, EM properties) alongside the
 * physics state that planck serializes automatically.
 *
 * The hooks are called for every serializable planck object (bodies,
 * fixtures, shapes, joints), so we filter on instanceof planck.Body.
 * Custom data is stored under the key "pkUserData" to avoid collision
 * with any planck-internal "userData" field.
 */
const sceneSerializer = new planck.Serializer<planck.World>({
  rootClass: planck.World,

  postSerialize(data: any, obj: any): any {
    if (obj instanceof planck.Body) {
      const userData = obj.getUserData() as BodyUserData | null;
      if (userData != null) {
        data.pkUserData = userData;
      }
    }
    return data;
  },

  postDeserialize(obj: any, data: any): any {
    if (obj instanceof planck.Body && data.pkUserData != null) {
      obj.setUserData(data.pkUserData as BodyUserData);
    }
    return obj;
  },
});

/**
 * Build an ordered array of all bodies in the world (used to map body ↔ index).
 * planck.js getBodyList() returns bodies in reverse-insertion order, so we reverse
 * to get a stable insertion-order list.
 */
function buildBodyList(world: planck.World): planck.Body[] {
  const bodies: planck.Body[] = [];
  for (let b = world.getBodyList(); b; b = b.getNext()) {
    bodies.push(b);
  }
  bodies.reverse();
  return bodies;
}

/**
 * Serialize the entire simulation state — physics world, world settings,
 * all custom body properties, and force links — to a human-readable JSON string.
 */
export function serializeScene(
  world: planck.World,
  settings: WorldSettings,
  forceLinks: ForceLink[] = [],
): string {
  const bodies = buildBodyList(world);

  const serializedLinks: SerializedForceLink[] = [];
  for (const fl of forceLinks) {
    const iA = bodies.indexOf(fl.bodyA);
    const iB = bodies.indexOf(fl.bodyB);
    if (iA === -1 || iB === -1) continue;   // skip if body no longer in world
    serializedLinks.push({
      bodyA:       iA,
      bodyB:       iB,
      coefficient: fl.coefficient,
      exponent:    fl.exponent,
      restLength:  fl.restLength,
      minDistance: fl.minDistance,
      maxDistance: fl.maxDistance,
    });
  }

  const file: SceneFile = {
    version: FILE_VERSION,
    settings,
    physics:    sceneSerializer.toJson(world),
    forceLinks: serializedLinks.length > 0 ? serializedLinks : undefined,
  };
  return JSON.stringify(file, null, 2);
}

/**
 * Deserialize a scene JSON string produced by serializeScene.
 * Returns the restored planck.World, WorldSettings, and ForceLink array.
 * Throws a descriptive Error if the JSON is invalid or the version is unsupported.
 */
export function deserializeScene(json: string): {
  world: planck.World;
  settings: WorldSettings;
  forceLinks: ForceLink[];
} {
  let file: SceneFile;
  try {
    file = JSON.parse(json) as SceneFile;
  } catch {
    throw new Error('Invalid scene file: not valid JSON.');
  }
  if (file.version !== FILE_VERSION) {
    throw new Error(`Unsupported scene file version: ${file.version} (expected ${FILE_VERSION}).`);
  }
  if (!file.settings || !file.physics) {
    throw new Error('Invalid scene file: missing "settings" or "physics" field.');
  }
  const world  = sceneSerializer.fromJson(file.physics);
  const bodies = buildBodyList(world);

  const forceLinks: ForceLink[] = [];
  for (const sfl of file.forceLinks ?? []) {
    const bodyA = bodies[sfl.bodyA];
    const bodyB = bodies[sfl.bodyB];
    if (!bodyA || !bodyB) continue;
    forceLinks.push({
      bodyA,
      bodyB,
      coefficient: sfl.coefficient,
      exponent:    sfl.exponent,
      restLength:  sfl.restLength,
      minDistance: sfl.minDistance,
      maxDistance: sfl.maxDistance,
    });
  }

  return { world, settings: file.settings, forceLinks };
}
