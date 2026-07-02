# SACG — Immersive 3D Plot Layout

An interactive 3D garden-plot layout tool for the South Austin Community Garden app,
built with **React Three Fiber + drei** (React 18). Plots render to scale (full 8′×50′,
half 8′×25′) with draggable raised beds, paths, features (water barrel, tomato stake,
trellis), and procedural crops you can arrange by hand. Ships behind a **2D / 3D toggle**
so the existing SVG editor stays available, and has a **read-only viewer** mode so members
can browse other members' plots.

---

## 🤖 If you're an AI agent asked to "merge this into the main project"

Do these steps, in order. Everything you need is in this README; `plot3d-export/INTEGRATION.md`
and the file-top comments in `plot3d-export/firebasePlotLayout.js` have extra detail.

1. **Copy the components** from **`plot3d-export/`** (NOT `plot3d-demo/`) into the app, e.g.
   `src/components/plot/layout3d/`:
   `layout3dModel.js`, `Plant3D.jsx`, `GardenShape3D.jsx`, `NavGuide.jsx`,
   `Plot3DLayout.jsx`, `PlotLayoutCard.jsx`, `firebasePlotLayout.js`.

2. **Install deps** — the app is **React 18.3.1**, so pin the React-18 line (R3F v9 / drei v10
   need React 19 and will break the build):
   ```bash
   npm i three@^0.160 @react-three/fiber@^8 @react-three/drei@^9
   ```

3. **Mount it** on the Plot detail page. Find the existing **Plot Layout** card — the
   `<div class="bg-white rounded-2xl … md:col-span-2">` that contains
   `<svg viewBox="0 0 400 300">` — and replace that card with `PlotLayoutCard`, passing the
   existing SVG editor through as `children` (it becomes the 2D tab):
   ```jsx
   import PlotLayoutCard from '@/components/plot/layout3d/PlotLayoutCard'
   import { loadPlotLayout3d, savePlotLayout3d } from '@/components/plot/layout3d/firebasePlotLayout'
   import { db } from '@/lib/firebase'            // ← this project's shared Firestore instance

   const [layout, setLayout] = useState(null)
   useEffect(() => { loadPlotLayout3d(db, plot.id).then(setLayout) }, [plot.id])

   <PlotLayoutCard
     widthFt={8} depthFt={50}                      // full plot; half auto-halves depth
     half={plot.half !== 'whole'}                  // ← CONFIRM this field on the real model
     layout={layout}
     onSave={(l) => savePlotLayout3d(db, plot.id, l).then(() => setLayout(l))}
     readOnly={!canEditThisPlot}                   // members viewing others' plots
   >
     <ExistingSvgLayoutEditor plot={plot} />       {/* your current 2D editor */}
   </PlotLayoutCard>
   ```

4. **Wire persistence** using `firebasePlotLayout.js` (do NOT hand-roll). Its top comment has a
   checklist: import the project's shared `db`, confirm the plot doc path (it assumes a
   top-level `plots` collection keyed by id — adjust `PLOTS_COLLECTION` / `plotDocRef` if plots
   are nested, e.g. by season), and add the included Firestore security rule (read: any member;
   write: plot holder or admin, `layout3d` field only).

5. **Verify**: run the app, open a plot, toggle **3D**, add a bed, drag it, add crops and drag
   them, switch to **Walk** and move with WASD, click **Save**, refresh — the layout should
   reload from Firestore.

### Gotchas
- Copy from **`plot3d-export/`**. `plot3d-demo/` is only a preview harness — its `localStorage`
  saving and approximated `garden-*` colors are demo-only; the real app uses your Firebase and
  your Tailwind theme (it already defines `garden-*`, so the components match natively).
- **Confirm `plot.half`** — `half={plot.half !== 'whole'}` was inferred from the "Split into A/B"
  button; verify the actual field/values.
- Keep the **2D tab** as a graceful fallback for browsers without WebGL.

---

## Data model (`Shape3D`) — saved as JSON under a new `layout3d` field
```js
{ version: 3, plot: { widthFt, depthFt, half }, shapes: [
  {
    id, kind: 'bed' | 'path' | 'feature',
    variant?: 'barrel' | 'stake' | 'trellis',   // features only
    pos:  [x, z],       // feet, origin = plot center
    size: [w, d, h],    // feet
    rotationY,          // radians
    color, label,
    crops: [{ id, type, pos: [x, z] }]  // beds only; pos is LOCAL to the bed
  }
]}
```
World units are **feet** (1 unit = 1 ft). It's a new field, so it never collides with any
existing 2D layout data. `type` is a key in `CROP_TYPES` (tomato, eggplant, pepper, beans,
sunflower, watermelon, squash, lettuce, carrot, herb, flower).

## Controls
- **3/4 View** (default) — raised third-person, best for editing. Drag empty ground to orbit,
  scroll to zoom.
- **Top** — straight-down for precise alignment.
- **Walk** — first-person: **WASD / arrow keys** to move, drag to look around (head-turn in place).
- Drag a bed/path/feature to reposition it; drag individual plants to arrange them within a bed.
- Click a shape to open its editor (label, color, size, rotation, feature type, crops).
- The **How to navigate** infographic (`NavGuide.jsx`) toggles from the toolbar.

## Knobs
- **Plot size** — `widthFt` / `depthFt` props (default 8×50; `half` halves the depth). If your
  A/B split is along width instead, change `effectivePlot()` in `layout3dModel.js`.
- **Crops** — add/edit in `CROP_TYPES` (`layout3dModel.js`). Rendering is procedural (no assets).
- **Features** — `FEATURE_TYPES` (`layout3dModel.js`); the 3D models live in `GardenShape3D.jsx`.
- **Soil** — a procedural canvas texture; no image files.

---

## Repo layout

| Folder | What it is |
|--------|------------|
| **`plot3d-export/`** | Port-ready components + `INTEGRATION.md` + `firebasePlotLayout.js`. **Copy these.** |
| **`plot3d-demo/`** | Standalone Vite app mounting the tool on a page mimicking the Plot detail page — preview only. |

## Run the preview demo
```bash
cd plot3d-demo
npm install
npm run dev
```
Open the printed URL. The demo persists to `localStorage` (Firebase stand-in) so refresh
round-trips.
