// firebasePlotLayout.js
// Persistence adapter for the 3D plot layout. Framework-agnostic (Firebase modular SDK v9+).
//
// The layout is plain JSON (see layout3dModel.js -> serializeLayout):
//   { version: 3, plot: { widthFt, depthFt, half }, shapes: Shape3D[] }
// It is stored on the plot document under a NEW field `layout3d`, so it never
// collides with any existing 2D layout data.
//
// ─────────────────────────────────────────────────────────────────────────────
// FOR THE PORTING SESSION (Claude on the real project) — DO THIS:
//   1. This project already initializes Firebase somewhere (search for
//      `getFirestore(` / `initializeApp(`). Import that shared `db` instead of the
//      placeholder below, OR pass `db` into these functions from the call site.
//   2. Confirm the plot collection name + id field. This assumes a top-level
//      `plots` collection keyed by plot id. Adjust `plotDocRef` if it's nested
//      (e.g. `seasons/{season}/plots/{id}`).
//   3. Wire into the page:
//        loadPlotLayout3d(db, plot.id)  -> pass as <PlotLayoutCard layout={...} />
//        savePlotLayout3d(db, plot.id, layout)  -> pass as onSave
//      (See INTEGRATION.md §3.)
//   4. Add the security rule at the bottom of this file so only the plot holder
//      or an admin can write, while any authenticated member can read.
// ─────────────────────────────────────────────────────────────────────────────

import { doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore'

const LAYOUT_FIELD = 'layout3d'
const PLOTS_COLLECTION = 'plots' // TODO: confirm/adjust to match this project

function plotDocRef(db, plotId) {
  return doc(db, PLOTS_COLLECTION, String(plotId))
}

/** Load a plot's saved 3D layout. Returns the layout object, or null if none. */
export async function loadPlotLayout3d(db, plotId) {
  const snap = await getDoc(plotDocRef(db, plotId))
  if (!snap.exists()) return null
  return snap.data()?.[LAYOUT_FIELD] ?? null
}

/** Save a plot's 3D layout (merges, so other plot fields are untouched). */
export async function savePlotLayout3d(db, plotId, layout) {
  await setDoc(plotDocRef(db, plotId), { [LAYOUT_FIELD]: layout }, { merge: true })
}

/**
 * Live-subscribe to a plot's layout (handy for the read-only viewer so it updates
 * when the holder edits). Returns an unsubscribe function.
 */
export function subscribePlotLayout3d(db, plotId, cb) {
  return onSnapshot(plotDocRef(db, plotId), (snap) => {
    cb(snap.exists() ? snap.data()?.[LAYOUT_FIELD] ?? null : null)
  })
}

/*
─── Firestore security rules (add to firestore.rules) ───────────────────────────
Reads open to any signed-in member; writes limited to the plot holder or an admin.
Adjust the holder/admin checks to match your data model.

  match /plots/{plotId} {
    allow read: if request.auth != null;

    // Only allow writing when the ONLY changed field is `layout3d`, and the
    // writer is the holder or an admin. (Broaden if the same page edits more.)
    allow update: if request.auth != null
      && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['layout3d'])
      && (
           resource.data.holderUid == request.auth.uid
           || get(/databases/$(database)/documents/members/$(request.auth.uid)).data.role == 'admin'
         );
  }

─── React usage sketch (on the real Plot detail page) ───────────────────────────
  import { useEffect, useState } from 'react'
  import { db } from '@/lib/firebase'                    // <- this project's shared db
  import { loadPlotLayout3d, savePlotLayout3d } from '@/.../firebasePlotLayout'
  import PlotLayoutCard from '@/.../PlotLayoutCard'

  const [layout, setLayout] = useState(null)
  useEffect(() => { loadPlotLayout3d(db, plot.id).then(setLayout) }, [plot.id])

  <PlotLayoutCard
    widthFt={8} depthFt={50} half={plot.half !== 'whole'}
    layout={layout}
    onSave={(l) => savePlotLayout3d(db, plot.id, l).then(() => setLayout(l))}
    readOnly={!canEdit}                                  // members viewing others' plots
  >
    <ExistingSvgLayoutEditor plot={plot} />
  </PlotLayoutCard>
─────────────────────────────────────────────────────────────────────────────────
*/
