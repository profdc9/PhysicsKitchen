import * as planck from 'planck';
import { PhysicsWorld, DEFAULT_WORLD_SETTINGS } from './physics/world';
import { Renderer, DEFAULT_RENDER_SETTINGS } from './rendering/renderer';
import { Toolbar } from './ui/toolbar';
import { StatusBar } from './ui/statusbar';
import { InputHandler } from './ui/input';

// --- Physics setup ---
const physicsWorld = new PhysicsWorld(DEFAULT_WORLD_SETTINGS);
const world = physicsWorld.world;

// --- Test scene: a ground platform ---
const ground = world.createBody({ type: 'static', position: planck.Vec2(0, -5) });
ground.createFixture({ shape: new planck.BoxShape(10, 0.5) });

// --- Canvas: fill the container ---
const canvas = document.getElementById('simulation-canvas') as HTMLCanvasElement;

function resizeCanvas(): void {
  canvas.width = canvas.offsetWidth;
  canvas.height = canvas.offsetHeight;
}
resizeCanvas();
window.addEventListener('resize', resizeCanvas);

// --- Renderer ---
const renderer = new Renderer(canvas, DEFAULT_RENDER_SETTINGS);

// --- UI ---
const toolbarEl = document.getElementById('toolbar') as HTMLElement;
const statusBarEl = document.getElementById('status-bar') as HTMLElement;
const toolbar = new Toolbar(toolbarEl);
const statusBar = new StatusBar(statusBarEl);
const inputHandler = new InputHandler(canvas, world, renderer, toolbar, statusBar);

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
let running = true;

function loop(): void {
  if (running) physicsWorld.step();
  renderer.draw(world);
  inputHandler.drawPreview();
  requestAnimationFrame(loop);
}

export function startSimulation(): void { running = true; }
export function pauseSimulation(): void { running = false; }
export function isRunning(): boolean { return running; }

requestAnimationFrame(loop);
