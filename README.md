# SACG — Immersive 3D Plot Layout

An interactive 3D garden-plot layout tool for the South Austin Community Garden app,
built with **React Three Fiber + drei** (React 18). Plots render to scale (full 8′×50′,
half 8′×25′) with draggable raised beds, paths, features (water barrel, tomato stake,
trellis), and procedural crops you can arrange by hand. Ships behind a **2D / 3D toggle**
so the existing SVG editor stays available, and has a **read-only viewer** mode for
members to browse others' plots.

## Layout of this repo

| Folder | What it is |
|--------|------------|
| **`plot3d-export/`** | The port-ready components + `INTEGRATION.md` + `firebasePlotLayout.js`. Copy these into the real app. **Start here.** |
| **`plot3d-demo/`** | A standalone Vite app that mounts the tool on a page mimicking the Plot detail page, so you can preview before porting. |

## Run the demo
```bash
cd plot3d-demo
npm install
npm run dev
```
Then open the printed URL (default http://localhost:5173). The demo persists layouts to
`localStorage` (Firebase stand-in) so refresh round-trips.

## Port into the real app
See **`plot3d-export/INTEGRATION.md`** — it has install commands (pinned to React 18),
the exact card to replace, `onSave` wiring via `firebasePlotLayout.js`, the data model,
and all the knobs.

## Controls
- **3/4 View** (default) — raised third-person, best for editing. Drag to orbit, scroll to zoom.
- **Top** — straight-down for precise alignment.
- **Walk** — first-person: **WASD / arrows** to move, drag to look around.
- Drag a bed/path/feature to move it; drag individual plants to arrange them within a bed.
