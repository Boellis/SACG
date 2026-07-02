// Plot3DLayout.jsx
// Immersive 3D plot layout editor (React Three Fiber + drei).
//
// Props:
//   widthFt, depthFt : full-plot dimensions in feet (half-plot halves the depth)
//   half             : boolean, this plot is a half plot
//   initialLayout    : stored layout object (or null) — see layout3dModel.js
//   onSave(layout)   : called with the serialized layout when "Save layout" is clicked
//   readOnly         : viewer mode — hides editing, keeps camera controls (for viewing others' plots)
//
// Cameras: '3/4' raised third-person (default), 'top' straight-down, 'walk' first-person WASD.
import React, { useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { Canvas, useThree, useFrame } from '@react-three/fiber'
import { OrbitControls, Grid, Sky, SoftShadows } from '@react-three/drei'
import GardenShape3D from './GardenShape3D'
import NavGuide from './NavGuide'
import {
  CROP_KEYS, CROP_TYPES, FEATURE_TYPES,
  cropGrid, deserializeLayout, effectivePlot, makeCrop, makeShape, serializeLayout,
} from './layout3dModel'

// --- shared button styles (match the app's existing button classes) ---------
const BTN_BASE =
  'inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-medium transition-colors ' +
  'focus:outline-none focus:ring-2 focus:ring-offset-1 disabled:opacity-50 text-xs'
const BTN_OUTLINE = `${BTN_BASE} bg-white text-garden-700 border border-garden-600 hover:bg-garden-50 focus:ring-garden-500`
const BTN_PRIMARY = `${BTN_BASE} bg-garden-600 text-white hover:bg-garden-700 focus:ring-garden-500`
const BTN_DANGER = `${BTN_BASE} bg-red-600 text-white hover:bg-red-700 focus:ring-red-500`

// --- procedural soil texture (no image assets required) ---------------------
function useSoilTexture(repeatX, repeatZ) {
  return useMemo(() => {
    const size = 256
    const c = document.createElement('canvas')
    c.width = c.height = size
    const ctx = c.getContext('2d')
    ctx.fillStyle = '#5b3a29'
    ctx.fillRect(0, 0, size, size)
    for (let i = 0; i < 9000; i++) {
      const x = Math.random() * size
      const y = Math.random() * size
      ctx.fillStyle = Math.random() > 0.5 ? 'rgba(90,60,40,0.4)' : 'rgba(40,26,16,0.5)'
      ctx.fillRect(x, y, 2, 2)
    }
    const tex = new THREE.CanvasTexture(c)
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping
    tex.repeat.set(repeatX, repeatZ)
    return tex
  }, [repeatX, repeatZ])
}

// --- camera presets ---------------------------------------------------------
function CameraRig({ view, w, d }) {
  const { camera, controls } = useThree()
  const applied = useRef('')
  React.useEffect(() => {
    if (!controls || applied.current === view) return
    applied.current = view
    const span = Math.max(w, d)
    if (view === 'top') {
      camera.position.set(0, span * 1.5, 0.001)
      controls.target.set(0, 0, 0)
    } else if (view === 'walk') {
      camera.position.set(0, 1.7, d / 2 + 3) // eye height, just outside the plot
      controls.target.set(0, 1.5, 0)
    } else {
      camera.position.set(span * 0.75, span * 0.9, span * 1.0)
      controls.target.set(0, 0, 0)
    }
    controls.update()
  }, [view, w, d, camera, controls])
  return null
}

// --- First-person controls for the Walk view --------------------------------
// Drag = turn your head in place (yaw/pitch). WASD / arrows = walk. Eye height fixed.
// `paused` (true while a shape/crop is being dragged) suppresses head-turn so editing
// in Walk view doesn't also swing the camera.
const EYE = 1.7
function WalkControls({ active, paused }) {
  const { camera, gl } = useThree()
  const keys = useRef({})
  const look = useRef({ yaw: 0, pitch: 0, dragging: false, px: 0, py: 0 })
  const pausedRef = useRef(paused)
  pausedRef.current = paused

  React.useEffect(() => {
    if (!active) return
    // seed yaw/pitch from the camera orientation CameraRig just set
    camera.rotation.order = 'YXZ'
    const e = new THREE.Euler().setFromQuaternion(camera.quaternion, 'YXZ')
    look.current.yaw = e.y
    look.current.pitch = e.x
    if (camera.position.y < EYE) camera.position.y = EYE

    const dom = gl.domElement
    const down = (ev) => { if (pausedRef.current) return; look.current.dragging = true; look.current.px = ev.clientX; look.current.py = ev.clientY }
    const up = () => { look.current.dragging = false }
    const move = (ev) => {
      if (!look.current.dragging || pausedRef.current) return
      look.current.yaw -= (ev.clientX - look.current.px) * 0.005
      look.current.pitch -= (ev.clientY - look.current.py) * 0.005
      look.current.pitch = Math.max(-1.2, Math.min(1.2, look.current.pitch))
      look.current.px = ev.clientX
      look.current.py = ev.clientY
    }
    const kd = (ev) => { keys.current[ev.code] = true }
    const ku = (ev) => { keys.current[ev.code] = false }
    dom.style.cursor = 'grab'
    dom.addEventListener('pointerdown', down)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointermove', move)
    window.addEventListener('keydown', kd)
    window.addEventListener('keyup', ku)
    return () => {
      dom.style.cursor = ''
      dom.removeEventListener('pointerdown', down)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('keydown', kd)
      window.removeEventListener('keyup', ku)
      keys.current = {}
      look.current.dragging = false
    }
  }, [active, camera, gl])

  useFrame((_, dt) => {
    if (!active) return
    const l = look.current
    camera.rotation.set(l.pitch, l.yaw, 0) // head-turn in place (position unchanged)

    const k = keys.current
    const fwd = new THREE.Vector3()
    camera.getWorldDirection(fwd)
    fwd.y = 0
    if (fwd.lengthSq() === 0) return
    fwd.normalize()
    const right = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0)).normalize()
    const step = new THREE.Vector3()
    if (k['KeyW'] || k['ArrowUp']) step.add(fwd)
    if (k['KeyS'] || k['ArrowDown']) step.sub(fwd)
    if (k['KeyD'] || k['ArrowRight']) step.add(right)
    if (k['KeyA'] || k['ArrowLeft']) step.sub(right)
    if (step.lengthSq() > 0) {
      step.normalize().multiplyScalar(8 * dt) // ~8 ft/sec
      camera.position.add(step)
    }
    camera.position.y = EYE // stay at eye height
  })
  return null
}

export default function Plot3DLayout({
  widthFt = 8,
  depthFt = 50,
  half = false,
  initialLayout = null,
  onSave,
  readOnly = false,
}) {
  const { w, d } = effectivePlot(widthFt, depthFt, half)
  const [shapes, setShapes] = useState(() => deserializeLayout(initialLayout))
  const [selectedId, setSelectedId] = useState(null)
  const [dragging, setDragging] = useState(false)
  const [view, setView] = useState('3/4')
  const [dirty, setDirty] = useState(false)
  const [showHelp, setShowHelp] = useState(true)

  const soil = useSoilTexture(Math.max(1, Math.round(w / 2)), Math.max(1, Math.round(d / 2)))
  const selected = shapes.find((s) => s.id === selectedId) || null

  const mutate = (fn) => { setShapes((prev) => fn(prev)); setDirty(true) }
  const addShape = (kind, variant) => {
    const s = makeShape(kind, [0, 0], variant)
    mutate((prev) => [...prev, s])
    setSelectedId(s.id)
  }
  const moveShape = (id, pos) => setShapes((prev) => prev.map((s) => (s.id === id ? { ...s, pos } : s)))
  const moveCrop = (shapeId, cropId, cpos) =>
    setShapes((prev) => prev.map((s) =>
      s.id === shapeId ? { ...s, crops: s.crops.map((c) => (c.id === cropId ? { ...c, pos: cpos } : c)) } : s))
  const patchShape = (id, patch) => mutate((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)))
  const removeShape = (id) => { mutate((prev) => prev.filter((s) => s.id !== id)); setSelectedId(null) }

  const addCrop = (id, type) =>
    setShapes((prev) => {
      const bed = prev.find((s) => s.id === id)
      const n = (bed?.crops || []).length
      const slot = cropGrid(n + 1, (bed?.size[0] || 4) * 0.92, (bed?.size[1] || 2) * 0.92)[n] || [0, 0]
      setDirty(true)
      return prev.map((s) => (s.id === id ? { ...s, crops: [...(s.crops || []), makeCrop(type, slot)] } : s))
    })
  const removeCrop = (id, cropId) =>
    patchShape(id, { crops: (selected?.crops || []).filter((c) => c.id !== cropId) })

  // dragging shapes/crops updates state silently; mark dirty when the drag ends
  const handleDragState = (isDragging) => { setDragging(isDragging); if (!isDragging) setDirty(true) }

  const save = () => { onSave?.(serializeLayout(shapes, { widthFt, depthFt, half })); setDirty(false) }

  return (
    <div className="space-y-3">
      {/* toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        {!readOnly && (
          <>
            <button type="button" className={BTN_OUTLINE} onClick={() => addShape('bed')}>+ Bed</button>
            <button type="button" className={BTN_OUTLINE} onClick={() => addShape('path')}>+ Path</button>
            <button type="button" className={BTN_OUTLINE} onClick={() => addShape('feature', 'barrel')}>+ Barrel</button>
            <button type="button" className={BTN_OUTLINE} onClick={() => addShape('feature', 'stake')}>+ Stake</button>
            <button type="button" className={BTN_OUTLINE} onClick={() => addShape('feature', 'trellis')}>+ Trellis</button>
            <span className="mx-1 self-stretch w-px bg-gray-200" />
          </>
        )}
        {['3/4', 'top', 'walk'].map((v) => (
          <button key={v} type="button" className={view === v ? BTN_PRIMARY : BTN_OUTLINE} onClick={() => setView(v)}>
            {v === '3/4' ? '3/4 View' : v === 'top' ? 'Top' : 'Walk'}
          </button>
        ))}
        <button type="button" className={BTN_OUTLINE} onClick={() => setShowHelp((s) => !s)}>
          {showHelp ? 'Hide help' : 'ⓘ How to navigate'}
        </button>
      </div>

      {showHelp && <NavGuide view={view} onClose={() => setShowHelp(false)} />}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* canvas */}
        <div className="lg:col-span-2">
          <div className="w-full rounded-lg border border-gray-200 overflow-hidden" style={{ height: 440 }}>
            <Canvas shadows dpr={[1, 2]} camera={{ fov: 55, near: 0.1, far: 2000 }}>
              <SoftShadows size={12} samples={8} />
              <Sky sunPosition={[10, 20, 10]} turbidity={4} />
              <hemisphereLight intensity={0.6} groundColor="#88663a" />
              <directionalLight
                position={[Math.max(w, d), Math.max(w, d) * 1.5, Math.max(w, d) * 0.6]}
                intensity={1.1}
                castShadow
                shadow-mapSize={[2048, 2048]}
              />

              <CameraRig view={view} w={w} d={d} />
              <WalkControls active={view === 'walk'} paused={dragging} />
              <OrbitControls
                makeDefault
                enabled={view !== 'walk' && !dragging}
                maxPolarAngle={Math.PI / 2 - 0.02}
                minDistance={1.5}
                maxDistance={Math.max(w, d) * 4}
              />

              {/* grass surround */}
              <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]} receiveShadow>
                <planeGeometry args={[w * 3, d * 1.5]} />
                <meshStandardMaterial color="#5c8a3a" roughness={1} />
              </mesh>

              {/* plot soil */}
              <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow onPointerDown={() => setSelectedId(null)}>
                <planeGeometry args={[w, d]} />
                <meshStandardMaterial map={soil} roughness={1} />
              </mesh>

              {/* 1 ft measurement grid */}
              <Grid
                args={[w, d]}
                cellSize={1} cellThickness={0.6} cellColor="#3f6212"
                sectionSize={5} sectionThickness={1.1} sectionColor="#365314"
                position={[0, 0.005, 0]} infiniteGrid={false} fadeDistance={Math.max(w, d) * 4}
              />

              {shapes.map((s) => (
                <GardenShape3D
                  key={s.id}
                  shape={s}
                  selected={s.id === selectedId}
                  onSelect={setSelectedId}
                  onMove={moveShape}
                  onCropMove={moveCrop}
                  onDragStateChange={handleDragState}
                />
              ))}
            </Canvas>
          </div>
          <p className="mt-1 text-[11px] text-gray-400">
            Plot: {w}′ × {d}′{half ? ' (half)' : ''} · grid = 1 ft
          </p>
        </div>

        {/* edit / info panel */}
        <div className="rounded-lg border border-gray-200 p-3 text-sm">
          {!selected ? (
            <p className="text-gray-500 text-xs">
              {readOnly ? 'Select a shape to see its details.' : 'Select a shape to edit its label, color, size, and crops.'}
            </p>
          ) : (
            <EditPanel
              shape={selected}
              readOnly={readOnly}
              onPatch={(patch) => patchShape(selected.id, patch)}
              onRemove={() => removeShape(selected.id)}
              onAddCrop={(type) => addCrop(selected.id, type)}
              onRemoveCrop={(cropId) => removeCrop(selected.id, cropId)}
            />
          )}
        </div>
      </div>

      {!readOnly && (
        <div className="flex items-center gap-3">
          <button type="button" className={BTN_PRIMARY} onClick={save} disabled={!dirty}>
            {dirty ? 'Save layout' : 'Saved'}
          </button>
          <span className="text-[11px] text-gray-400">{shapes.length} shape{shapes.length === 1 ? '' : 's'}</span>
        </div>
      )}
    </div>
  )
}

// --- selected-shape editor --------------------------------------------------
function EditPanel({ shape, onPatch, onRemove, onAddCrop, onRemoveCrop, readOnly }) {
  const [w, d, h] = shape.size
  const [cropType, setCropType] = useState(CROP_KEYS[0])
  const num = (v, fallback) => (v === '' || isNaN(+v) ? fallback : +v)

  const Field = ({ label, children }) => (
    <label className="block">
      <span className="text-gray-500 text-[11px]">{label}</span>
      {children}
    </label>
  )
  const inputCls = 'mt-0.5 w-full rounded border border-gray-200 px-2 py-1 text-xs'

  // read-only viewer: compact summary
  if (readOnly) {
    return (
      <div className="space-y-2">
        <div className="text-xs font-semibold text-gray-700 capitalize">{shape.label || shape.variant || shape.kind}</div>
        {shape.kind === 'bed' && (
          <ul className="space-y-1">
            {(shape.crops || []).map((c) => (
              <li key={c.id} className="text-xs">{CROP_TYPES[c.type]?.emoji} {CROP_TYPES[c.type]?.label || c.type}</li>
            ))}
            {!(shape.crops || []).length && <li className="text-gray-400 text-xs">No crops.</li>}
          </ul>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-gray-700 capitalize">{shape.variant || shape.kind}</span>
        <button className={BTN_DANGER} onClick={onRemove}>Delete</button>
      </div>

      {shape.kind === 'feature' && (
        <Field label="Type">
          <select className={inputCls} value={shape.variant}
                  onChange={(e) => {
                    const v = e.target.value
                    onPatch({ variant: v, size: [...FEATURE_TYPES[v].size], color: FEATURE_TYPES[v].color, label: FEATURE_TYPES[v].label })
                  }}>
            {Object.entries(FEATURE_TYPES).map(([k, f]) => <option key={k} value={k}>{f.label}</option>)}
          </select>
        </Field>
      )}

      <Field label="Label">
        <input className={inputCls} value={shape.label} onChange={(e) => onPatch({ label: e.target.value })} />
      </Field>

      <Field label="Color">
        <input type="color" className="mt-0.5 h-7 w-full rounded border border-gray-200"
               value={shape.color} onChange={(e) => onPatch({ color: e.target.value })} />
      </Field>

      <div className="grid grid-cols-3 gap-2">
        <Field label="Width (ft)">
          <input type="number" step="0.5" className={inputCls} value={w}
                 onChange={(e) => onPatch({ size: [num(e.target.value, w), d, h] })} />
        </Field>
        <Field label="Depth (ft)">
          <input type="number" step="0.5" className={inputCls} value={d}
                 onChange={(e) => onPatch({ size: [w, num(e.target.value, d), h] })} />
        </Field>
        <Field label="Height (ft)">
          <input type="number" step="0.25" className={inputCls} value={h}
                 onChange={(e) => onPatch({ size: [w, d, num(e.target.value, h)] })} />
        </Field>
      </div>

      <Field label={`Rotation (${Math.round((shape.rotationY * 180) / Math.PI)}°)`}>
        <input type="range" min={0} max={Math.PI * 2} step={0.01} className="mt-0.5 w-full"
               value={shape.rotationY} onChange={(e) => onPatch({ rotationY: +e.target.value })} />
      </Field>

      {shape.kind === 'bed' && (
        <div className="pt-2 border-t border-gray-100">
          <span className="text-gray-500 text-[11px]">Crops (drag them in the 3D view to arrange)</span>
          <div className="mt-1 flex gap-1">
            <select className={inputCls + ' flex-1'} value={cropType} onChange={(e) => setCropType(e.target.value)}>
              {CROP_KEYS.map((k) => <option key={k} value={k}>{CROP_TYPES[k].emoji} {CROP_TYPES[k].label}</option>)}
            </select>
            <button type="button" className={BTN_OUTLINE} onClick={() => onAddCrop(cropType)}>Add</button>
          </div>
          <ul className="mt-2 space-y-1">
            {(shape.crops || []).map((c) => (
              <li key={c.id} className="flex items-center justify-between text-xs">
                <span>{CROP_TYPES[c.type]?.emoji} {CROP_TYPES[c.type]?.label || c.type}</span>
                <button className="text-red-500 hover:text-red-700" onClick={() => onRemoveCrop(c.id)}>✕</button>
              </li>
            ))}
            {!(shape.crops || []).length && <li className="text-gray-400 text-xs">No crops yet.</li>}
          </ul>
        </div>
      )}
    </div>
  )
}
