import * as planck from 'planck';
import { PhysicsWorld, DEFAULT_WORLD_SETTINGS } from './physics/world';
import { WorldSnapshot } from './physics/snapshot';
import { Renderer, DEFAULT_RENDER_SETTINGS } from './rendering/renderer';
import { Toolbar } from './ui/toolbar';
import { StatusBar } from './ui/statusbar';
import { SimulationControls } from './ui/controls';
import { InputHandler } from './ui/input';
import { PropertiesPanel } from './ui/propertiesPanel';

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
const propsPanelEl = document.getElementById('properties-panel') as HTMLElement;

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

// Sidebar toolbar (shapes + joints)
const toolbar = new Toolbar(sidebarEl, selectBtn, statusBar);

// Properties panel (right side — shown when a body is selected)
const propertiesPanel = new PropertiesPanel(propsPanelEl);

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

// --- Revert: restore world to pre-play snapshot ---
controls.onRevert(() => {
  const restoredWorld = snapshot.restore();
  if (!restoredWorld) return;
  physicsWorld = PhysicsWorld.fromWorld(restoredWorld, DEFAULT_WORLD_SETTINGS);
  registerJointCascade(physicsWorld.world);
  propertiesPanel.hide();
  deleteBtn.disabled = true;
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

// --- Simulation + render loop ---
function loop(): void {
  if (controls.isRunning()) physicsWorld.step();
  renderer.draw(physicsWorld.world, inputHandler.getSelectTool().getSelectedJoint());
  inputHandler.drawPreview();
  propertiesPanel.refresh();
  requestAnimationFrame(loop);
}

requestAnimationFrame(loop);
