// PlotLayoutCard.jsx
// Drop-in replacement for the "Plot Layout" card. Adds a 2D / 3D toggle in the header.
// - 2D mode renders your existing SVG editor (passed in as `children`).
// - 3D mode renders the immersive R3F tool.
//
// Both modes read/write the SAME saved layout via `layout` + `onSave` so switching
// never loses data. (The 3D schema is new — see layout3dModel.js — so if your 2D
// editor uses a different shape format, keep them on separate fields and pass the
// 3D one here.)
import React, { useState } from 'react'
import Plot3DLayout from './Plot3DLayout'

export default function PlotLayoutCard({
  children,           // your existing 2D SVG editor
  layout,             // stored 3D layout (or null)
  onSave,             // (layout) => void
  widthFt = 8,   // full plot 8×50, half plot 8×25
  depthFt = 50,
  half = false,
  readOnly = false,
  defaultMode = '3d',
}) {
  const [mode, setMode] = useState(defaultMode)

  const tab = (m, label) => (
    <button
      type="button"
      onClick={() => setMode(m)}
      className={
        'px-3 py-1 text-xs font-medium rounded-md transition-colors ' +
        (mode === m ? 'bg-white text-garden-700 shadow-sm' : 'text-gray-500 hover:text-gray-700')
      }
    >
      {label}
    </button>
  )

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 md:col-span-2">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-800">Plot Layout</h2>
        <div className="inline-flex items-center gap-1 rounded-lg bg-gray-100 p-1">
          {tab('2d', '2D')}
          {tab('3d', '3D')}
        </div>
      </div>

      {mode === '2d' ? (
        <div className="space-y-3">{children}</div>
      ) : (
        <Plot3DLayout
          widthFt={widthFt}
          depthFt={depthFt}
          half={half}
          initialLayout={layout}
          onSave={onSave}
          readOnly={readOnly}
        />
      )}
    </div>
  )
}
