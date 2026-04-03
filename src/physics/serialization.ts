import * as planck from 'planck';
import { WorldSettings } from './world';
import { BodyUserData } from '../types/userData';

/** Versioned JSON envelope for saved scenes. */
interface SceneFile {
  version: number;
  settings: WorldSettings;
  physics: planck.SerializedType;
  /** Accumulated simulation time (seconds); absent in older saves treated as 0. */
  simTime?: number;
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
 * Serialize the entire simulation state — physics world, world settings,
 * and all custom body properties — to a human-readable JSON string.
 */
export function serializeScene(
  world: planck.World,
  settings: WorldSettings,
  simTime: number = 0,
): string {
  const file: SceneFile = {
    version: FILE_VERSION,
    settings,
    physics: sceneSerializer.toJson(world),
    simTime,
  };
  return JSON.stringify(file, null, 2);
}

/**
 * Deserialize a scene JSON string produced by serializeScene.
 * Returns the restored planck.World, WorldSettings, and simTime.
 * Throws a descriptive Error if the JSON is invalid or the version is unsupported.
 */
export function deserializeScene(json: string): {
  world: planck.World;
  settings: WorldSettings;
  simTime: number;
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
  const world = sceneSerializer.fromJson(file.physics);
  return { world, settings: file.settings, simTime: file.simTime ?? 0 };
}
