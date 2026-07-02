# Immersive 3D Plot Layout — integration guide

A React Three Fiber (R3F) + drei rebuild of the Plot Layout tool: a to-scale 3D
garden plot you orbit, with raised beds, paths, features, and procedural plants.
Ships behind a **2D / 3D toggle** so the existing SVG editor stays available.

## Files (drop into `src/`, e.g. `src/components/plot/layout3d/`)
| File | Purpose |
|------|---------|
| `layout3dModel.js` | Data schema, crop catalog, factories, (de)serialize helpers. **No React.** |
| `Plant3D.jsx` | Procedural plant model (stem + foliage + fruit), tinted per crop type. |
| `GardenShape3D.jsx` | One bed/path/feature + drag-to-arrange, feature models, draggable crops. |
| `NavGuide.jsx` | On-page "How to navigate" infographic. |
| `Plot3DLayout.jsx` | The `<Canvas>`, ground, camera presets, WASD walk, toolbar, edit panel, save. |
| `PlotLayoutCard.jsx` | Card wrapper with the 2D/3D toggle. Mount this in the plot page. |
| `firebasePlotLayout.js` | Firestore load/save adapter + security rule + usage sketch. |

## 1. Install deps
Deployed bundle uses **React 18.3.1** (confirmed from the live `/assets` bundle), so pin the
React-18-compatible line:
```bash
npm i three@^0.160 @react-three/fiber@^8 @react-three/drei@^9
```
(`@react-three/fiber@9` / `drei@10` require React 19 — do **not** use them here.)

## 2. Mount it in the Plot detail page
Find the existing **"Plot Layout"** card (the `<div class="bg-white rounded-2xl ... md:col-span-2">`
containing the `<svg viewBox="0 0 400 300">`). Replace that whole card with:

```jsx
import PlotLayoutCard from '@/components/plot/layout3d/PlotLayoutCard'

<PlotLayoutCard
  widthFt={8}                  // SACG: full plot 8×50, half plot 8×25
  depthFt={50}
  half={plot.half !== 'whole'} // your plot has half === 'whole' | 'A' | 'B'
  layout={plot.layout3d}       // stored 3D layout (or null)
  onSave={(layout) => savePlotLayout3d(plot.id, layout)}
>
  {/* your existing <svg> 2D editor goes here as children (2D tab) */}
  <ExistingSvgLayoutEditor plot={plot} />
</PlotLayoutCard>
```

If you don't want the 2D tab at all, render `<Plot3DLayout .../>` directly and skip the card.

## 3. Wire persistence (`onSave`) → **use `firebasePlotLayout.js`**
`onSave` receives plain JSON:
```js
{ version: 3, plot: { widthFt, depthFt, half }, shapes: Shape3D[] }
```
Stored on the plot doc under a new field `layout3d` (never collides with any 2D data).

A ready-to-use adapter is included: **`firebasePlotLayout.js`** — it has
`loadPlotLayout3d(db, plotId)`, `savePlotLayout3d(db, plotId, layout)`,
`subscribePlotLayout3d(...)`, a React usage sketch, and the Firestore security rule.
**Porting steps are written at the top of that file** (import this project's shared
`db`, confirm the `plots` collection path, add the rule). Do that instead of hand-rolling.

> The demo (`plot3d-demo/`) persists to `localStorage` instead of Firebase (this machine
> isn't in the Firebase project) — that's only so refresh round-trips; swap in the adapter
> above for the real app.

## 4. Data model (`Shape3D`)
```js
{
  id, kind: 'bed' | 'path' | 'feature',
  variant?: 'barrel' | 'stake' | 'trellis',  // features only
  pos:  [x, z],       // feet, origin = plot center
  size: [w, d, h],    // feet
  rotationY,          // radians
  color, label,
  crops: [{ id, type, pos: [x, z] }]  // beds only; pos is LOCAL to the bed, type ∈ CROP_TYPES
}
```
World units are **feet** (1 unit = 1 ft). Half-plots halve the **depth** — change in
`effectivePlot()` if your split is along width instead.

## 5. Viewing others' plots (read-only)
The tool has a `readOnly` mode — editing controls hidden, camera controls (3/4 / Top / Walk,
orbit, zoom, WASD) kept — so members can explore any plot they're allowed to see:
```jsx
<Plot3DLayout widthFt={8} depthFt={50} half={plot.half !== 'whole'}
              initialLayout={plot.layout3d} readOnly />
```
Since every layout is just the JSON from `onSave`, a member's own plots and other members'
plots render from the exact same data — gate write access (only the holder/admin can `onSave`)
in your Firestore rules; reads can be open to all members.

## Notes / knobs
- **Camera:** default raised third-person **3/4 view**; toolbar has `3/4 / Top / Walk`.
  **Walk** view supports **WASD / arrow keys** to move + drag to look (see `WalkControls`).
  Tune framing in `CameraRig` (`Plot3DLayout.jsx`).
- **Crops** render as procedural plants (no assets). Each crop is **draggable within its bed**.
  Add/adjust types in `CROP_TYPES` (`layout3dModel.js`) — includes tomato, eggplant, pepper,
  beans, sunflower, watermelon, squash, lettuce, carrot, herb, flower.
- **Features:** `barrel` (water barrel), `stake` (tomato stake), `trellis` — models live in
  `GardenShape3D.jsx`; catalog in `FEATURE_TYPES`.
- **NavGuide.jsx** is the on-page "How to navigate" infographic (toggle in the toolbar).
- **Soil** is a procedural canvas texture — no asset files.
- **Buttons** reuse your Tailwind `garden-*` classes; swap for your shared `<Button>` if you have one.
- **WebGL fallback:** the 2D tab is the fallback. Optionally gate the 3D tab behind a
  `WebGLRenderingContext` check.
```
