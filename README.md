# SACG — handoff repo

This repo holds two self-contained pieces of work to merge into the **main South Austin
Community Garden app**, plus a preview demo. Everything an agent needs to execute each task
is written below and in the linked per-folder READMEs — read them, then match the details to
the real project's schema.

## 📁 What's in this repo — where everything is

| Path | What it is | Start here |
|------|------------|-----------|
| **`plot3d-export/`** | **Task A** — port-ready 3D plot-layout components, `INTEGRATION.md`, and the Firebase adapter `firebasePlotLayout.js`. **Copy these into the app.** | `plot3d-export/INTEGRATION.md` |
| **`member-cleanup/`** | **Task B** — dry-run-first admin script to delete Excel-imported "ghost" member accounts and reassign their plots. | `member-cleanup/README.md` |
| `plot3d-demo/` | Standalone Vite app that previews Task A on a page mimicking the Plot detail page. Preview only — not for porting. | `plot3d-demo/` (`npm i && npm run dev`) |

---

# Task A — Merge the immersive 3D plot layout

A React Three Fiber + drei (React 18) 3D layout tool: to-scale plots (full 8′×50′, half 8′×25′)
with draggable beds, paths, features (water barrel, tomato stake, trellis), and procedural crops
you arrange by hand. Ships behind a **2D / 3D toggle** (keeps the existing SVG editor) and has a
**read-only viewer** so members can browse other members' plots.

### 🤖 Agent steps
1. **Copy components** from **`plot3d-export/`** (NOT `plot3d-demo/`) into e.g.
   `src/components/plot/layout3d/`: `layout3dModel.js`, `Plant3D.jsx`, `GardenShape3D.jsx`,
   `NavGuide.jsx`, `Plot3DLayout.jsx`, `PlotLayoutCard.jsx`, `firebasePlotLayout.js`.
2. **Install (React 18 — pinned; R3F v9/drei v10 need React 19 and break the build):**
   ```bash
   npm i three@^0.160 @react-three/fiber@^8 @react-three/drei@^9
   ```
3. **Mount** on the Plot detail page — replace the existing Plot Layout card (the
   `<div class="… md:col-span-2">` containing `<svg viewBox="0 0 400 300">`) with `PlotLayoutCard`,
   passing your current SVG editor as `children` (it becomes the 2D tab):
   ```jsx
   import PlotLayoutCard from '@/components/plot/layout3d/PlotLayoutCard'
   import { loadPlotLayout3d, savePlotLayout3d } from '@/components/plot/layout3d/firebasePlotLayout'
   import { db } from '@/lib/firebase'            // ← this project's shared Firestore

   const [layout, setLayout] = useState(null)
   useEffect(() => { loadPlotLayout3d(db, plot.id).then(setLayout) }, [plot.id])

   <PlotLayoutCard
     widthFt={8} depthFt={50}
     half={plot.half !== 'whole'}                  // ← CONFIRM this field on the real model
     layout={layout}
     onSave={(l) => savePlotLayout3d(db, plot.id, l).then(() => setLayout(l))}
     readOnly={!canEditThisPlot}
   >
     <ExistingSvgLayoutEditor plot={plot} />
   </PlotLayoutCard>
   ```
4. **Persistence** — use `firebasePlotLayout.js` (has the checklist at the top): import the shared
   `db`, confirm the plot doc path (assumes top-level `plots` keyed by id — adjust if nested), add
   the included Firestore security rule. Layouts save as JSON under a new `layout3d` field.
5. **Verify** — 3D tab → add/drag a bed → add/drag crops → Walk (WASD) → Save → refresh reloads it.

Full detail: **`plot3d-export/INTEGRATION.md`**.

### Data model (`Shape3D`, stored under `layout3d`)
```js
{ version: 3, plot: { widthFt, depthFt, half }, shapes: [
  { id, kind:'bed'|'path'|'feature', variant?:'barrel'|'stake'|'trellis',
    pos:[x,z], size:[w,d,h], rotationY, color, label,
    crops:[{ id, type, pos:[x,z] }] }   // beds only; pos LOCAL to the bed
]}
```
Units are feet. `type` ∈ `CROP_TYPES` (tomato, eggplant, pepper, beans, sunflower, watermelon,
squash, lettuce, carrot, herb, flower).

### Controls
- **3/4 View** (default, best for editing) — drag ground to orbit, scroll to zoom.
- **Top** — straight-down for alignment. **Walk** — first-person: WASD/arrows move, drag to look.
- Drag beds/paths/features to move; drag plants to arrange within a bed; click a shape to edit it.

### Gotchas
- Copy from `plot3d-export/`, not the demo (demo's `localStorage` saving + approximated
  `garden-*` colors are demo-only; the real app uses your Firebase and Tailwind theme).
- Confirm the `plot.half` field/values. Keep the 2D tab as a WebGL fallback.

---

# Task B — Clean up "ghost" member accounts

Excel-imported member profiles are holding plots the real (July) signups can't claim. Remove the
ghosts and move their plots to the real duplicate accounts.

### Decisions already made (baked into the script)
- **Ghost** = `role: 'member'`, created **2026-05-31**, excluding **Brandon Ellis**.
- **Match** ghost → real by **exact email** (case-insensitive).
- **Reassign** the ghost's plot(s) to the real account; **delete the ghost's Firestore profile only**.
- **No match / ambiguous / real already has a plot → skip & report** (never orphan a plot).

### 🤖 Agent steps
1. Open **`member-cleanup/cleanup-ghost-members.mjs`** and match the **`CONFIG`** block to the real
   schema — collection names, member field names, and especially **how a plot references its holder**
   (`plotHolderFields`). The `TODO`s mark every spot. If plots are tracked on the member doc instead
   of a `plots` collection, adapt the reassignment (noted in `member-cleanup/README.md`).
2. Authenticate: `export GOOGLE_APPLICATION_CREDENTIALS=/path/to/serviceAccount.json`.
3. **Dry run** (writes nothing): `cd member-cleanup && npm install && npm run dryrun`.
   It prints the full plan + `report-dryrun.json`. **Sanity-check `Ghost candidates: N`** against the
   number of Excel rows before going further.
4. **Back up Firestore** (export), then **`npm run commit`** to apply.

Full detail + schema checklist: **`member-cleanup/README.md`**.

---

## Run the preview demo (Task A)
```bash
cd plot3d-demo
npm install
npm run dev        # open the printed URL; persists to localStorage (Firebase stand-in)
```
