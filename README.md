# PhysicsKitchen

An open-source interactive 2D physics sandbox with electromagnetic simulation, inspired by [Physion](https://physion.net/).

**[Try it live](https://profdc9.github.io/PhysicsKitchen/)**

## Features

- **Rigid body physics** powered by [planck.js](https://piqnt.com/planck.js) (a JavaScript port of Box2D)
- **Shape tools** — circle, box, polygon, edge, chain
- **10 joint types** — Revolute, Weld, Prismatic, Distance, Rope, Pulley, Gear, Wheel, Friction, Motor
- **Body editing handles** — resize, reshape vertices, and rotate bodies while paused
- **Electromagnetic simulation** — electrostatic (Coulomb), magnetic dipole, and sinusoidal current sources
- **Collision sounds** — per-body configurable oscillator tones via the Web Audio API
- **Scene serialization** — copy/paste scenes as JSON via the clipboard
- **World settings** — gravity, solver parameters, field size, and EM configuration
- **Zoomable, pannable camera**
- **Desktop app** via [Tauri v2](https://tauri.app/) (browser build also fully functional)

## Running Locally

```bash
npm install
npm run dev
```

Then open `http://localhost:5173/PhysicsKitchen/` in your browser.

## Building

```bash
npm run build
```

Output is written to `dist/`.

## Desktop App (Tauri)

```bash
npm run tauri dev   # development
npm run tauri build # production installer
```

Requires the [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/) for your platform.

## Tech Stack

- TypeScript
- [planck.js v1](https://piqnt.com/planck.js) — rigid body physics
- HTML5 Canvas — rendering
- [Vite](https://vitejs.dev/) — build tool
- [Tauri v2](https://tauri.app/) — desktop packaging

## License

MIT — see [index.html](index.html) for full license text.
