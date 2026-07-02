// WholeGarden3D.jsx
// READ-ONLY R3F scene that renders EVERY garden plot in one shared world so members
// can fly around and see the whole community garden at once. It reuses the exact
// same bed/path/feature+crop renderer as the single-plot editor (GardenShape3D) by
// passing no-op handlers and selected={false}, so nothing here is editable.
//
// World units = FEET (1 unit === 1 ft), matching layout3dModel.js.
//
// LAYOUT (see WholeGardenPage.tsx for the data plumbing):
//   Two parallel N–S lines of plots with a 5ft gravel path between them, centered on
//   world X=0 (X=-2.5..+2.5). North = -Z, South = +Z.
//     RIGHT/EAST line = plot number <= RIGHT_MAX : depth extends +X (east)
//     LEFT/WEST  line = plot number >  RIGHT_MAX : depth extends -X (west)
//   Each plot is a <group> at its world spot, rotated about Y so its LOCAL +Z (the
//   25ft depth of the saved layout) points AWAY from the path. Split A/B halves share
//   one 6x25 footprint, offset ±6.25ft along local Z (A nearest the path).
import { useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { OrbitControls, Sky, SoftShadows, Billboard, Text } from '@react-three/drei'
import GardenShape3D from './GardenShape3D'
import { deserializeLayout } from './layout3dModel'

// ---- garden geometry constants (feet) --------------------------------------
// Split threshold — plots numbered <= RIGHT_MAX go on the EAST line, the rest WEST.
// Trivial to change; the east line always re-centers on Z=0 around it and the west
// line's north end always aligns to the east line's north end (plot 1).
export const RIGHT_MAX = 24
const SHORT_MAX = 33 // highest plot number on the short (25–33) line

const PLOT_WIDTH = 6                 // ft — the short side; runs along N–S (Z)
const PLOT_DEPTH = 25                // ft — the long side; extends away from the path
const HALF_DEPTH = PLOT_DEPTH / 2    // 12.5 — one split half
const GAP = 3                        // ft between consecutive plots along N–S
const SLOT = PLOT_WIDTH + GAP        // 9 ft of N–S span per plot
const PATH_HALF = 2.5                // path is 5ft wide: X = -2.5 .. +2.5

const RIGHT_MID = (1 + RIGHT_MAX) / 2                 // number that sits at Z=0 on the east line
const NORTH_Z = (1 - RIGHT_MID) * SLOT               // world Z of the northmost plot center
const LEFT_START = RIGHT_MAX + 1                      // first number on the west line
const CENTER_OFFSET_X = PATH_HALF + PLOT_DEPTH / 2    // 15 — plot center distance from world X=0

const LABEL_Y = 9                    // ft — floating label height (above the tallest plants)

const noop = () => {}

/** World placement (center + Y-rotation) for a plot number. */
function placement(number) {
  if (number <= RIGHT_MAX) {
    // Plots 1–24 (long line): WEST side, depth extends -X. Centered on Z=0, plot 1 north.
    return { centerX: -CENTER_OFFSET_X, centerZ: (number - RIGHT_MID) * SLOT, rotationY: -Math.PI / 2 }
  }
  // Plots 25–33 (short line): EAST side, depth extends +X. North end = 33, running south to 25.
  return { centerX: CENTER_OFFSET_X, centerZ: NORTH_Z + (SHORT_MAX - number) * SLOT, rotationY: Math.PI / 2 }
}

/** Collapse the flat plot list into one entry per number: { number, whole?, aHalf?, bHalf? }. */
function groupPlots(plots) {
  const byNum = new Map()
  for (const p of plots || []) {
    const g = byNum.get(p.number) || { number: p.number }
    if (p.half === 'A') g.aHalf = p
    else if (p.half === 'B') g.bHalf = p
    else g.whole = p
    byNum.set(p.number, g)
  }
  return [...byNum.values()].sort((a, b) => a.number - b.number)
}

// ---- reusable pieces -------------------------------------------------------

/** All shapes of one saved layout, rendered read-only (no-op handlers). */
function ShapeSet({ layout }) {
  const shapes = useMemo(() => deserializeLayout(layout), [layout])
  return shapes.map((s) => (
    <GardenShape3D
      key={s.id}
      shape={s}
      selected={false}
      onSelect={noop}
      onMove={noop}
      onCropMove={noop}
      onDragStateChange={noop}
    />
  ))
}

/** A dirt footprint rectangle (w × d, in the local X/Z plane) with a thin tan border. */
function Footprint({ w, d }) {
  const rail = '#d9c9a3'
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.006, 0]} receiveShadow>
        <planeGeometry args={[w, d]} />
        <meshStandardMaterial color="#5b3a29" roughness={1} />
      </mesh>
      <mesh position={[-w / 2, 0.03, 0]}>
        <boxGeometry args={[0.12, 0.06, d]} />
        <meshStandardMaterial color={rail} roughness={0.9} />
      </mesh>
      <mesh position={[w / 2, 0.03, 0]}>
        <boxGeometry args={[0.12, 0.06, d]} />
        <meshStandardMaterial color={rail} roughness={0.9} />
      </mesh>
      <mesh position={[0, 0.03, -d / 2]}>
        <boxGeometry args={[w, 0.06, 0.12]} />
        <meshStandardMaterial color={rail} roughness={0.9} />
      </mesh>
      <mesh position={[0, 0.03, d / 2]}>
        <boxGeometry args={[w, 0.06, 0.12]} />
        <meshStandardMaterial color={rail} roughness={0.9} />
      </mesh>
    </group>
  )
}

/** Floating, camera-facing label with the plot id and holder name. */
function PlotLabel({ id, holderName }) {
  return (
    <Billboard position={[0, LABEL_Y, 0]}>
      <Text fontSize={1} color="#14532d" anchorX="center" anchorY="middle" outlineWidth={0.04} outlineColor="#ffffff">
        {'Plot ' + id}
      </Text>
      <Text position={[0, -1.05, 0]} fontSize={0.62} color="#374151" anchorX="center" anchorY="middle" outlineWidth={0.03} outlineColor="#ffffff">
        {holderName || 'Available'}
      </Text>
    </Billboard>
  )
}

/** One plot number: a whole 6×25 footprint, or two stacked split halves. */
function PlotUnit({ group }) {
  const { number, whole, aHalf, bHalf } = group
  const { centerX, centerZ, rotationY } = placement(number)
  const isSplit = !!(aHalf || bHalf)

  return (
    <group position={[centerX, 0, centerZ]} rotation={[0, rotationY, 0]}>
      {isSplit ? (
        <>
          {/* A = the half NEAREST the path (local -Z side) */}
          <group position={[0, 0, -HALF_DEPTH / 2]}>
            <Footprint w={PLOT_WIDTH} d={HALF_DEPTH} />
            {aHalf && <ShapeSet layout={aHalf.layout3d} />}
            <PlotLabel id={aHalf?.id || number + 'A'} holderName={aHalf?.holderName} />
          </group>
          {/* B = the FAR half (local +Z side) */}
          <group position={[0, 0, HALF_DEPTH / 2]}>
            <Footprint w={PLOT_WIDTH} d={HALF_DEPTH} />
            {bHalf && <ShapeSet layout={bHalf.layout3d} />}
            <PlotLabel id={bHalf?.id || number + 'B'} holderName={bHalf?.holderName} />
          </group>
        </>
      ) : (
        <>
          <Footprint w={PLOT_WIDTH} d={PLOT_DEPTH} />
          {whole && <ShapeSet layout={whole.layout3d} />}
          <PlotLabel id={whole?.id || String(number)} holderName={whole?.holderName} />
        </>
      )}
    </group>
  )
}

// ---- surrounds -------------------------------------------------------------

/** A small wooden shed: box body + a single-slope slanted roof + a door. */
function Shed({ position }) {
  return (
    <group position={position}>
      <mesh position={[0, 2.5, 0]} castShadow receiveShadow>
        <boxGeometry args={[8, 5, 6]} />
        <meshStandardMaterial color="#8a5a3b" roughness={0.9} />
      </mesh>
      {/* slanted roof — a wide thin slab tilted forward, overhanging the walls */}
      <mesh position={[0, 5.35, 0]} rotation={[0.2, 0, 0]} castShadow>
        <boxGeometry args={[9, 0.3, 7.4]} />
        <meshStandardMaterial color="#5b3a29" roughness={0.85} />
      </mesh>
      {/* door */}
      <mesh position={[0, 1.7, 3.01]}>
        <planeGeometry args={[2, 3.2]} />
        <meshStandardMaterial color="#3f2a1c" roughness={0.9} />
      </mesh>
    </group>
  )
}

/** A simple tree: brown trunk + a few faceted green foliage spheres. */
function Tree({ position, scale = 1 }) {
  return (
    <group position={position} scale={scale}>
      <mesh position={[0, 1.2, 0]} castShadow>
        <cylinderGeometry args={[0.28, 0.4, 2.4, 7]} />
        <meshStandardMaterial color="#6b4a2b" roughness={0.95} />
      </mesh>
      <mesh position={[0, 3.1, 0]} castShadow>
        <sphereGeometry args={[1.75, 12, 12]} />
        <meshStandardMaterial color="#3f7a34" roughness={0.9} flatShading />
      </mesh>
      <mesh position={[1.05, 2.55, 0.35]} castShadow>
        <sphereGeometry args={[1.15, 12, 12]} />
        <meshStandardMaterial color="#4a8c3e" roughness={0.9} flatShading />
      </mesh>
      <mesh position={[-0.95, 2.7, -0.45]} castShadow>
        <sphereGeometry args={[1.25, 12, 12]} />
        <meshStandardMaterial color="#3a7030" roughness={0.9} flatShading />
      </mesh>
    </group>
  )
}

// Orchard trees scattered in the empty SW area (south of the short west line).
// [x, z, scale]
const ORCHARD = [
  [9, 32, 1.05], [19, 39, 0.9], [11, 51, 1.15], [23, 57, 1.0],
  [8, 67, 0.95], [18, 73, 1.1], [13, 86, 1.0], [24, 92, 0.9],
]

// ---- camera --------------------------------------------------------------

const VIEWS = {
  overview: { pos: [95, 150, 205], target: [0, 6, 0] },
  path: { pos: [0, 16, 150], target: [0, 4, -30] },
  top: { pos: [0, 260, 0.001], target: [0, 0, 0] },
}

/** Applies a camera preset once whenever `view` changes (OrbitControls is makeDefault). */
function CameraRig({ view }) {
  const { camera, controls } = useThree()
  const applied = useRef('')
  useEffect(() => {
    if (!controls || applied.current === view) return
    applied.current = view
    const v = VIEWS[view] || VIEWS.overview
    camera.position.set(v.pos[0], v.pos[1], v.pos[2])
    controls.target.set(v.target[0], v.target[1], v.target[2])
    controls.update()
  }, [view, camera, controls])
  return null
}

// ---- button styles (mirror Plot3DLayout.jsx) -----------------------------
const BTN_BASE =
  'inline-flex items-center justify-center rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ' +
  'focus:outline-none focus:ring-2 focus:ring-offset-1'
const BTN_OUTLINE = `${BTN_BASE} bg-white text-garden-700 border border-garden-600 hover:bg-garden-50 focus:ring-garden-500`
const BTN_PRIMARY = `${BTN_BASE} bg-garden-600 text-white hover:bg-garden-700 focus:ring-garden-500`

// ---- scene ---------------------------------------------------------------

export default function WholeGarden3D({ plots }) {
  const [view, setView] = useState('overview')
  const groups = useMemo(() => groupPlots(plots), [plots])

  // Path runs the full length of the (longer) east line, with margin.
  const pathLen = (RIGHT_MAX - 1) * SLOT + PLOT_WIDTH + 12

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {[
          ['overview', 'Overview'],
          ['path', 'Down the path'],
          ['top', 'Top-down'],
        ].map(([v, label]) => (
          <button key={v} type="button" className={view === v ? BTN_PRIMARY : BTN_OUTLINE} onClick={() => setView(v)}>
            {label}
          </button>
        ))}
        <span className="ml-auto self-center text-[11px] text-gray-400">
          {groups.length} plot{groups.length === 1 ? '' : 's'} · drag to orbit · scroll to zoom
        </span>
      </div>

      <div
        className="w-full overflow-hidden rounded-xl border border-gray-200 bg-sky-100"
        style={{ height: '70vh', minHeight: 460 }}
      >
        <Canvas shadows dpr={[1, 2]} camera={{ position: [95, 150, 205], fov: 50, near: 0.5, far: 3000 }}>
          <SoftShadows size={14} samples={8} />
          <Sky sunPosition={[120, 90, 60]} turbidity={4} />
          <hemisphereLight intensity={0.6} groundColor="#6b8f3a" />
          <directionalLight
            position={[120, 200, 80]}
            intensity={1.15}
            castShadow
            shadow-mapSize={[2048, 2048]}
            shadow-camera-near={0.5}
            shadow-camera-far={700}
            shadow-camera-left={-170}
            shadow-camera-right={170}
            shadow-camera-top={170}
            shadow-camera-bottom={-170}
          />

          <CameraRig view={view} />
          <OrbitControls
            makeDefault
            enablePan
            maxPolarAngle={Math.PI / 2 - 0.03}
            minDistance={5}
            maxDistance={520}
          />

          {/* grass ground under everything */}
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]} receiveShadow>
            <planeGeometry args={[360, 360]} />
            <meshStandardMaterial color="#5c8a3a" roughness={1} />
          </mesh>

          {/* central gravel path (5ft wide, running N–S) */}
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.008, 0]} receiveShadow>
            <planeGeometry args={[PATH_HALF * 2, pathLen]} />
            <meshStandardMaterial color="#c2b8a3" roughness={1} />
          </mesh>

          {/* all the plots */}
          {groups.map((g) => (
            <PlotUnit key={g.number} group={g} />
          ))}

          {/* surrounds filling the emptier west/south area */}
          <Shed position={[14, 0, 14]} />
          {ORCHARD.map(([x, z, s], i) => (
            <Tree key={i} position={[x, 0, z]} scale={s} />
          ))}
        </Canvas>
      </div>
    </div>
  )
}
