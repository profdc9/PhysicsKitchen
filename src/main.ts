import * as planck from 'planck';
import { PhysicsWorld, WorldSettings, DEFAULT_WORLD_SETTINGS } from './physics/world';
import { WorldSnapshot } from './physics/snapshot';
import { serializeScene, deserializeScene } from './physics/serialization';
import { Renderer, DEFAULT_RENDER_SETTINGS } from './rendering/renderer';
import { Toolbar } from './ui/toolbar';
import { StatusBar } from './ui/statusbar';
import { SimulationControls } from './ui/controls';
import { InputHandler } from './ui/input';
import { PropertiesPanel } from './ui/propertiesPanel';
import { WorldSettingsPanel } from './ui/worldSettingsPanel';
import { attachHint } from './ui/hoverHint';

// --- Canvas: fill the container ---
const canvas = document.getElementById('simulation-canvas') as HTMLCanvasElement;

function resizeCanvas(): void {
  const rect = canvas.getBoundingClientRect();
  canvas.width  = Math.round(rect.width);
  canvas.height = Math.round(rect.height);
}
resizeCanvas();
window.addEventListener('resize', resizeCanvas);

// --- Physics setup ---
let physicsWorld = new PhysicsWorld(DEFAULT_WORLD_SETTINGS);
const snapshot = new WorldSnapshot();

function buildInitialScene(): void {
  const ground = physicsWorld.world.createBody({ type: 'static', position: planck.Vec2(0, -5) });
  ground.createFixture({ shape: new planck.BoxShape(10, 0.5) });
}
buildInitialScene();

/**
 * Register the remove-joint cascade hook on a world.
 * When a RevoluteJoint or PrismaticJoint is destroyed, any GearJoint that
 * references it must also be destroyed (planck.js does not do this automatically).
 */
function registerJointCascade(world: planck.World): void {
  world.on('remove-joint', (removedJoint) => {
    const gears: planck.Joint[] = [];
    for (let j = world.getJointList(); j; j = j.getNext()) {
      if (j.getType() !== 'gear-joint') continue;
      const gj = j as planck.GearJoint;
      if (gj.getJoint1() === removedJoint || gj.getJoint2() === removedJoint) {
        gears.push(j);
      }
    }
    for (const g of gears) world.destroyJoint(g);
  });
}
registerJointCascade(physicsWorld.world);

// --- Renderer ---
const renderer = new Renderer(canvas, DEFAULT_RENDER_SETTINGS);

// --- Build UI ---
const topBarEl    = document.getElementById('top-bar') as HTMLElement;
const sidebarEl   = document.getElementById('sidebar') as HTMLElement;
const statusBarEl = document.getElementById('status-bar') as HTMLElement;
const propsPanelEl        = document.getElementById('properties-panel') as HTMLElement;
const worldSettingsPanelEl = document.getElementById('world-settings-panel') as HTMLElement;

// StatusBar must be created first so controls and toolbar can attach hints to it
const statusBar = new StatusBar(statusBarEl);

// Simulation controls (play/pause, revert, reset) go in the top bar
const controls = new SimulationControls(topBarEl, statusBar);

// Separator between controls and select
const sep = document.createElement('div');
sep.className = 'separator';
topBarEl.appendChild(sep);

// Select button lives in the top bar but is managed by Toolbar for active state
const selectBtn = document.createElement('button');
selectBtn.className = 'top-btn';
selectBtn.textContent = '↖ Select';
topBarEl.appendChild(selectBtn);

// Delete button — enabled only while something is selected
const deleteBtn = document.createElement('button');
deleteBtn.className = 'top-btn';
deleteBtn.textContent = '🗑 Delete';
deleteBtn.disabled = true;
deleteBtn.addEventListener('click', () => inputHandler.getSelectTool().deleteSelected());
topBarEl.appendChild(deleteBtn);

// World Settings toggle button (always available)
const worldBtn = document.createElement('button');
worldBtn.className = 'top-btn';
worldBtn.textContent = '⚙ World';
topBarEl.appendChild(worldBtn);

// Sidebar toolbar (shapes + joints)
const toolbar = new Toolbar(sidebarEl, selectBtn, statusBar);

// Properties panel (right side — shown when a body or joint is selected)
const propertiesPanel = new PropertiesPanel(propsPanelEl);

// World settings panel (left side of canvas — toggled by ⚙ World button)
const worldSettingsPanel = new WorldSettingsPanel(
  worldSettingsPanelEl,
  () => physicsWorld.getSettings(),
  (patch) => physicsWorld.applySettings(patch),
);

worldBtn.addEventListener('click', () => {
  if (worldSettingsPanel.isVisible()) {
    worldSettingsPanel.hide();
    worldBtn.classList.remove('active');
  } else {
    worldSettingsPanel.show();
    worldBtn.classList.add('active');
  }
});

/**
 * Replace the current simulation with a scene deserialized from a JSON string.
 * Resets the snapshot, hides the properties panel, and rebuilds the input handler.
 */
function loadSceneFromJson(json: string): void {
  let result: { world: planck.World; settings: WorldSettings };
  try {
    result = deserializeScene(json);
  } catch (err) {
    alert(`Failed to load scene:\n${(err as Error).message}`);
    return;
  }
  controls.pause();
  snapshot.clear();
  physicsWorld = PhysicsWorld.fromWorld(result.world, result.settings);
  registerJointCascade(physicsWorld.world);
  propertiesPanel.hide();
  deleteBtn.disabled = true;
  worldSettingsPanel.refresh();
  inputHandler = makeInputHandler();
}

// Copy scene: serialize current state to JSON and write to clipboard
const copyBtn = document.createElement('button');
copyBtn.className = 'top-btn';
copyBtn.textContent = '📋 Copy';
attachHint(copyBtn, 'Copy scene — serialize the entire scene to JSON and copy to clipboard', statusBar);
copyBtn.addEventListener('click', async () => {
  const json = serializeScene(physicsWorld.world, physicsWorld.getSettings());
  try {
    await navigator.clipboard.writeText(json);
    copyBtn.textContent = '✓ Copied';
    setTimeout(() => { copyBtn.textContent = '📋 Copy'; }, 1500);
  } catch {
    alert('Could not write to clipboard. Please check browser permissions.');
  }
});
topBarEl.appendChild(copyBtn);

// Load scene: read JSON from clipboard and replace the current simulation
const loadBtn = document.createElement('button');
loadBtn.className = 'top-btn';
loadBtn.textContent = '📂 Load';
attachHint(loadBtn, 'Load scene — paste a scene from the clipboard and replace the current simulation', statusBar);
loadBtn.addEventListener('click', async () => {
  let json: string;
  try {
    json = await navigator.clipboard.readText();
  } catch {
    alert('Could not read from clipboard. Please check browser permissions.');
    return;
  }
  loadSceneFromJson(json);
});
topBarEl.appendChild(loadBtn);

function makeInputHandler(): InputHandler {
  const handler = new InputHandler(canvas, physicsWorld.world, renderer, toolbar, statusBar, () => controls.isRunning());
  handler.getSelectTool().onSelect((body) => {
    if (body) { propertiesPanel.show(body); deleteBtn.disabled = false; }
    else       { propertiesPanel.hide();    deleteBtn.disabled = true;  }
  });
  handler.getSelectTool().onJointSelect((joint) => {
    if (joint) { propertiesPanel.showJoint(joint); deleteBtn.disabled = false; }
    else        { propertiesPanel.hide();           deleteBtn.disabled = true;  }
  });
  return handler;
}

let inputHandler = makeInputHandler();

// --- Play: capture snapshot on first play press per edit session ---
controls.onPlay(() => {
  snapshot.captureIfNeeded(physicsWorld.world);
  controls.enableRevert();
});

// --- Pause: recall bodies that escaped the field ---
controls.onPause(() => {
  recallEscapedBodies(physicsWorld.world, physicsWorld.getSettings(), renderer);
});

// --- Revert: restore world to pre-play snapshot ---
controls.onRevert(() => {
  const restoredWorld = snapshot.restore();
  if (!restoredWorld) return;
  physicsWorld = PhysicsWorld.fromWorld(restoredWorld, DEFAULT_WORLD_SETTINGS);
  registerJointCascade(physicsWorld.world);
  propertiesPanel.hide();
  deleteBtn.disabled = true;
  worldSettingsPanel.refresh();
  inputHandler = makeInputHandler();
});

// --- Reset: discard everything and rebuild the initial scene ---
controls.onReset(() => {
  snapshot.clear();
  physicsWorld = new PhysicsWorld(DEFAULT_WORLD_SETTINGS);
  buildInitialScene();
  registerJointCascade(physicsWorld.world);
  propertiesPanel.hide();
  deleteBtn.disabled = true;
  worldSettingsPanel.refresh();
  inputHandler = makeInputHandler();
});

// --- Mouse wheel zoom ---
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  const rect = canvas.getBoundingClientRect();
  renderer.zoom(e.deltaY < 0, e.clientX - rect.left, e.clientY - rect.top);
}, { passive: false });

// --- Middle mouse pan ---
let isPanning = false;
let lastPanX = 0;
let lastPanY = 0;

canvas.addEventListener('mousedown', (e) => {
  if (e.button === 1) {
    isPanning = true;
    lastPanX = e.clientX;
    lastPanY = e.clientY;
    e.preventDefault();
  }
});

window.addEventListener('mousemove', (e) => {
  if (!isPanning) return;
  renderer.pan(e.clientX - lastPanX, e.clientY - lastPanY);
  lastPanX = e.clientX;
  lastPanY = e.clientY;
});

window.addEventListener('mouseup', (e) => {
  if (e.button === 1) isPanning = false;
});

// --- Field-size body recall -----------------------------------------------
// When the simulation pauses, any non-static body whose distance from the
// origin exceeds the field radius is teleported to a random non-overlapping
// position within the current view.

const RECALL_MAX_TRIES = 50;

function recallEscapedBodies(
  world: planck.World,
  settings: ReturnType<typeof physicsWorld.getSettings>,
  rend: typeof renderer,
): void {
  if (!settings.fieldSizeEnabled || settings.fieldSize <= 0) return;

  const bounds      = rend.getVisibleWorldBounds();
  const fieldSizeSq = settings.fieldSize * settings.fieldSize;

  for (let body = world.getBodyList(); body; body = body.getNext()) {
    if (body.getType() === 'static') continue;
    const pos = body.getPosition();
    if (pos.x * pos.x + pos.y * pos.y <= fieldSizeSq) continue;
    relocateBody(body, world, bounds);
  }
}

function relocateBody(
  body: planck.Body,
  world: planck.World,
  bounds: { minX: number; minY: number; maxX: number; maxY: number },
): void {
  // Approximate body half-extents from current world AABB.
  let halfW = 0.5, halfH = 0.5;
  for (let f = body.getFixtureList(); f; f = f.getNext()) {
    const aabb = f.getAABB(0);
    halfW = Math.max(halfW, (aabb.upperBound.x - aabb.lowerBound.x) / 2);
    halfH = Math.max(halfH, (aabb.upperBound.y - aabb.lowerBound.y) / 2);
  }

  const margin = Math.max(halfW, halfH) + 0.1;
  const rangeX = bounds.maxX - bounds.minX - margin * 2;
  const rangeY = bounds.maxY - bounds.minY - margin * 2;

  const tryPlace = (x: number, y: number): boolean => {
    const queryAABB = planck.AABB(
      planck.Vec2(x - halfW, y - halfH),
      planck.Vec2(x + halfW, y + halfH),
    );
    let occupied = false;
    world.queryAABB(queryAABB, (fixture) => {
      if (fixture.getBody() !== body) { occupied = true; return false; }
      return true;
    });
    if (!occupied) {
      body.setPosition(planck.Vec2(x, y));
      body.setLinearVelocity(planck.Vec2(0, 0));
      body.setAngularVelocity(0);
    }
    return !occupied;
  };

  if (rangeX > 0 && rangeY > 0) {
    for (let i = 0; i < RECALL_MAX_TRIES; i++) {
      const x = bounds.minX + margin + Math.random() * rangeX;
      const y = bounds.minY + margin + Math.random() * rangeY;
      if (tryPlace(x, y)) return;
    }
  }

  // Fallback: center of view, even if overlapping.
  const cx = (bounds.minX + bounds.maxX) / 2;
  const cy = (bounds.minY + bounds.maxY) / 2;
  body.setPosition(planck.Vec2(cx, cy));
  body.setLinearVelocity(planck.Vec2(0, 0));
  body.setAngularVelocity(0);
}

// --- Load from ?scene= URL parameter ---
// If the page URL contains ?scene=<url>, fetch that URL and load it as the initial scene.
(async function loadSceneFromUrl(): Promise<void> {
  const params = new URLSearchParams(window.location.search);
  const sceneUrl = params.get('scene');
  if (!sceneUrl) return;
  try {
    const response = await fetch(sceneUrl);
    if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`);
    const json = await response.text();
    loadSceneFromJson(json);
  } catch (err) {
    console.warn('Could not load scene from URL parameter:', err);
  }
})();

// --- Simulation + render loop ---
function loop(): void {
  if (controls.isRunning()) physicsWorld.step();
  renderer.draw(physicsWorld.world, inputHandler.getSelectTool().getSelectedJoint());
  inputHandler.drawPreview();
  propertiesPanel.refresh();
  requestAnimationFrame(loop);
}

requestAnimationFrame(loop);
