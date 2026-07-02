// DemoPlotPage.jsx
// A trimmed clone of the real Plot detail page, used only to preview the
// 3D layout tool + 2D/3D toggle in context before porting to the app.
import React, { useState } from 'react'
import PlotLayoutCard from './layout3d/PlotLayoutCard'

const NAV = [
  ['Dashboard', false], ['Plots', true], ['Calendar', false], ['My Hours', false],
  ['Message Board', false], ['Members', false], ['Waitlist', false], ['Dues', false],
  ['Settings', false], ['Email', false],
]

const BTN =
  'inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-medium transition-colors ' +
  'focus:outline-none focus:ring-2 focus:ring-offset-1 disabled:opacity-50'

// A static stand-in for the app's existing 2D SVG editor (shown under the "2D" tab).
function Legacy2DEditor() {
  return (
    <>
      <p className="text-xs text-gray-500">
        (Demo) This is where your current 2D SVG editor renders under the “2D” tab.
      </p>
      <div className="flex flex-wrap gap-2">
        {['+ Rectangle', '+ Circle', '+ Triangle'].map((t) => (
          <button key={t} type="button"
            className={`${BTN} bg-white text-garden-700 border border-garden-600 hover:bg-garden-50 focus:ring-garden-500 text-xs`}>
            {t}
          </button>
        ))}
      </div>
      <svg viewBox="0 0 400 300" className="w-full rounded-lg border border-gray-200 bg-garden-50/40" role="img" aria-label="Plot layout">
        <rect x="1" y="1" width="398" height="298" fill="none" stroke="#d1d5db" strokeWidth="2" />
        <g>
          <rect x="30" y="64" width="92" height="60" rx="4" fill="#4d7c0f" fillOpacity="0.55" />
          <rect x="30" y="64" width="92" height="60" rx="4" fill="none" stroke="#4d7c0f" strokeWidth="1.5" />
          <text x="76" y="94" textAnchor="middle" dominantBaseline="central" fontSize="12" fill="#1f2937">eggplant</text>
        </g>
        <g>
          <polygon points="321,59 292,100 349,100" fill="#4d7c0f" fillOpacity="0.55" />
          <polygon points="321,59 292,100 349,100" fill="none" stroke="#4d7c0f" strokeWidth="1.5" />
          <text x="321" y="80" textAnchor="middle" dominantBaseline="central" fontSize="12" fill="#1f2937">tomato</text>
        </g>
      </svg>
    </>
  )
}

const Card = ({ title, className = '', children }) => (
  <div className={`bg-white rounded-2xl shadow-sm border border-gray-100 p-6 ${className}`}>
    {title && <h2 className="text-lg font-semibold text-gray-800 mb-4">{title}</h2>}
    {children}
  </div>
)
const Row = ({ k, v }) => (
  <div className="flex justify-between">
    <dt className="text-gray-500">{k}</dt>
    <dd className="font-medium">{v}</dd>
  </div>
)

// Demo persistence: localStorage stands in for Firebase so refresh round-trips.
// In the real app this is replaced by loadPlotLayout3d / savePlotLayout3d (see
// plot3d-export/firebasePlotLayout.js).
const DEMO_KEY = 'sacg-demo-layout3d'
const loadDemo = () => {
  try { const raw = localStorage.getItem(DEMO_KEY); return raw ? JSON.parse(raw) : null } catch { return null }
}

export default function DemoPlotPage() {
  const [saved, setSaved] = useState(loadDemo)

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-gray-50">
      {/* sidebar */}
      <aside className="w-full md:w-56 bg-garden-600 text-white flex flex-col md:fixed md:inset-y-0 md:left-0 z-10">
        <div className="p-4 text-xl font-bold tracking-tight border-b border-garden-700/50">🌱 SACG</div>
        <div className="flex-1 overflow-y-auto p-2">
          <nav className="flex flex-col gap-1 mt-4">
            {NAV.map(([label, active]) => (
              <a key={label} href="#"
                className={'px-3 py-2 rounded-lg text-sm font-medium transition-colors ' +
                  (active ? 'bg-garden-700 text-white' : 'text-garden-100 hover:bg-garden-700/60')}>
                {label}
              </a>
            ))}
          </nav>
        </div>
      </aside>

      {/* main */}
      <div className="flex-1 flex flex-col md:ml-56 min-h-screen">
        <header className="h-14 bg-white border-b border-gray-200 flex items-center justify-between px-4 gap-4 shrink-0">
          <span className="text-sm text-gray-700 font-medium truncate">Brandon Ellis</span>
          <button className="text-sm text-gray-500 hover:text-red-600 transition-colors whitespace-nowrap">Sign out</button>
        </header>

        <main className="flex-1 p-6 overflow-y-auto">
          <div className="space-y-6">
            <div className="flex items-center gap-4">
              <button className={`${BTN} bg-transparent text-gray-700 hover:bg-gray-100 focus:ring-gray-300`}>← Back</button>
              <h1 className="text-2xl font-bold text-gray-900">Plot 1</h1>
              <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-green-100 text-green-800">assigned</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card title="Plot Info">
                <dl className="space-y-2 text-sm">
                  <Row k="Number" v="1" />
                  <Row k="Half" v="whole" />
                  <Row k="Size" v="8′ × 50′" />
                  <Row k="Season" v="2026" />
                  <Row k="Holder" v="Caitlin Haisler" />
                </dl>
              </Card>

              <Card title="Dues & Deposit">
                <dl className="space-y-2 text-sm">
                  <Row k="Dues Amount" v="$69.00" />
                  <div className="flex justify-between items-center">
                    <dt className="text-gray-500">Dues Paid</dt>
                    <dd><span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-amber-100 text-amber-800">Unpaid</span></dd>
                  </div>
                  <Row k="Deposit Amount" v="$25.00" />
                </dl>
              </Card>

              {/* THE FEATURE: 2D/3D toggle card */}
              <PlotLayoutCard
                widthFt={8}
                depthFt={50}
                half={false}
                layout={saved}
                onSave={(layout) => {
                  setSaved(layout)
                  try { localStorage.setItem(DEMO_KEY, JSON.stringify(layout)) } catch (_) {}
                  // eslint-disable-next-line no-console
                  console.log('onSave layout →', layout)
                }}
              >
                <Legacy2DEditor />
              </PlotLayoutCard>

              <Card title="Edit Plot" className="md:col-span-2">
                <button className={`${BTN} bg-garden-600 text-white hover:bg-garden-700 focus:ring-garden-500`}>
                  Edit size / dues / notes
                </button>
                {saved && (
                  <div className="mt-3 flex items-center gap-3">
                    <p className="text-xs text-gray-500">
                      Saved layout persists across refresh: {saved.shapes.length} shape(s) — JSON in console.
                    </p>
                    <button
                      className="text-xs text-red-500 hover:text-red-700"
                      onClick={() => { localStorage.removeItem(DEMO_KEY); location.reload() }}
                    >
                      Clear saved layout
                    </button>
                  </div>
                )}
              </Card>
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}
