/**
 * Platform-aware file I/O.
 *
 * When running inside Tauri (desktop), scene files are saved/loaded via
 * native file-system dialogs.  When running in a browser, the clipboard is
 * used instead (same behaviour as before Tauri was added).
 */

/** True when the app is running inside a Tauri WebView. */
export function isTauriApp(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

const SCENE_FILTERS = [
  { name: 'PhysicsKitchen Scene', extensions: ['pkscene', 'json'] },
];

/**
 * Save a scene JSON string.
 *   • Tauri  — opens a native Save-As dialog, writes to the chosen file.
 *   • Browser — copies to the clipboard.
 *
 * Returns true on success, false if the user cancelled (Tauri only).
 */
export async function saveScene(json: string): Promise<boolean> {
  if (isTauriApp()) {
    const { save }          = await import('@tauri-apps/plugin-dialog');
    const { writeTextFile } = await import('@tauri-apps/plugin-fs');
    const path = await save({ filters: SCENE_FILTERS, defaultPath: 'scene.pkscene' });
    if (!path) return false;
    await writeTextFile(path, json);
    return true;
  }

  // Browser: write to clipboard
  await navigator.clipboard.writeText(json);
  return true;
}

/**
 * Load a scene JSON string.
 *   • Tauri  — opens a native Open dialog, reads from the chosen file.
 *   • Browser — reads from the clipboard.
 *
 * Returns the JSON string, or null if the user cancelled (Tauri only).
 * Throws on I/O or clipboard permission errors.
 */
export async function loadScene(): Promise<string | null> {
  if (isTauriApp()) {
    const { open }         = await import('@tauri-apps/plugin-dialog');
    const { readTextFile } = await import('@tauri-apps/plugin-fs');
    const path = await open({ filters: SCENE_FILTERS, multiple: false });
    if (!path || Array.isArray(path)) return null;
    return await readTextFile(path);
  }

  // Browser: read from clipboard
  return await navigator.clipboard.readText();
}
