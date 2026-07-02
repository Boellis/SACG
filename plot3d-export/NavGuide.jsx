// NavGuide.jsx
// On-page infographic explaining how to navigate the 3D views.
// Highlights the tips relevant to the active camera view.
import React from 'react'

const Icon = ({ children }) => (
  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor"
       strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-garden-700 shrink-0">
    {children}
  </svg>
)

const ICONS = {
  orbit: <><ellipse cx="12" cy="12" rx="9" ry="4" /><circle cx="12" cy="12" r="2.2" /></>,
  zoom: <><circle cx="11" cy="11" r="6" /><path d="M20 20l-3.5-3.5M11 8v6M8 11h6" /></>,
  move: <><path d="M12 3v18M3 12h18M12 3l-2.5 2.5M12 3l2.5 2.5M12 21l-2.5-2.5M12 21l2.5-2.5M3 12l2.5-2.5M3 12l2.5 2.5M21 12l-2.5-2.5M21 12l-2.5 2.5" /></>,
  plant: <><path d="M12 21v-7" /><path d="M12 14c0-3-2-5-5-5 0 3 2 5 5 5z" /><path d="M12 12c0-3 2-5 5-5 0 3-2 5-5 5z" /></>,
  click: <><path d="M9 3v6M5.6 5.6l2.1 2.1M3 9h6M12 12l8 3-3.2 1.3L14 20l-2-8z" /></>,
  walk: <><circle cx="12" cy="4" r="1.6" /><path d="M12 6v7M12 9l-3 2M12 9l3 2M12 13l-2 7M12 13l2 7" /></>,
}

function Tip({ icon, title, children, highlight }) {
  return (
    <div className={'flex items-start gap-2 rounded-lg p-2 ' + (highlight ? 'bg-garden-50 ring-1 ring-garden-200' : '')}>
      <Icon>{ICONS[icon]}</Icon>
      <div className="leading-tight">
        <div className="text-xs font-semibold text-gray-800">{title}</div>
        <div className="text-[11px] text-gray-500">{children}</div>
      </div>
    </div>
  )
}

export default function NavGuide({ view = '3/4', onClose }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-3">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-semibold text-gray-700">How to navigate</h3>
        {onClose && (
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xs" aria-label="Hide help">✕</button>
        )}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-1">
        <Tip icon="orbit" title="Orbit" highlight={view === '3/4'}>Drag empty ground to rotate around the plot.</Tip>
        <Tip icon="zoom" title="Zoom">Scroll / pinch to zoom in and out.</Tip>
        <Tip icon="click" title="Select & edit">Click a bed, path, or feature to open its editor.</Tip>
        <Tip icon="move" title="Move a shape">Drag a bed/path/feature to reposition it.</Tip>
        <Tip icon="plant" title="Arrange crops">Drag individual plants around inside a bed.</Tip>
        <Tip icon="walk" title="Walk (WASD)" highlight={view === 'walk'}>
          In <b>Walk</b> view, use W A S D (or arrows) to move; drag to look around.
        </Tip>
      </div>
      <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-gray-500">
        <span><b className="text-gray-700">3/4 View</b> — best for editing</span>
        <span><b className="text-gray-700">Top</b> — precise alignment</span>
        <span><b className="text-gray-700">Walk</b> — stand in your garden</span>
      </div>
    </div>
  )
}
