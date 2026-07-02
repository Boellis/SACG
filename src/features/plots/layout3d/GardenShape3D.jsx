// GardenShape3D.jsx
// Renders one Shape3D (bed / path / feature) plus:
//  - drag-to-arrange the whole shape on the ground plane
//  - drag individual crops around within a bed (bed-local, clamped to the soil)
// Dragging works by intersecting the pointer ray with a horizontal plane.
import React, { useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { Edges } from '@react-three/drei'
import Plant3D from './Plant3D'
import { STRUCTURE_MODELS } from './structures'
import { FEATURE_TYPES } from './layout3dModel'

const GROUND = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)

// ---- feature models --------------------------------------------------------
function Stake({ h, color, mat }) {
  return (
    <group>
      <mesh position={[0, h / 2, 0]} castShadow>
        <cylinderGeometry args={[0.04, 0.055, h, 8]} />
        <meshStandardMaterial color={color} roughness={0.8} {...mat} />
      </mesh>
      <mesh position={[0, h * 0.72, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.02, 0.02, 0.5, 6]} />
        <meshStandardMaterial color={color} roughness={0.8} {...mat} />
      </mesh>
    </group>
  )
}

function Trellis({ w, h, color, mat }) {
  const posts = [-w / 2 + 0.05, w / 2 - 0.05]
  const rails = [h * 0.33, h * 0.66, h - 0.05]
  const slats = 5
  const M = (props) => <meshStandardMaterial color={color} roughness={0.9} {...mat} {...props} />
  return (
    <group>
      {posts.map((x, i) => (
        <mesh key={'p' + i} position={[x, h / 2, 0]} castShadow>
          <boxGeometry args={[0.1, h, 0.1]} />
          <M />
        </mesh>
      ))}
      {rails.map((y, i) => (
        <mesh key={'r' + i} position={[0, y, 0]} castShadow>
          <boxGeometry args={[w, 0.06, 0.06]} />
          <M />
        </mesh>
      ))}
      {Array.from({ length: slats }).map((_, i) => {
        const x = -w / 2 + (w / (slats - 1)) * i
        return (
          <mesh key={'v' + i} position={[x, h / 2, 0]}>
            <boxGeometry args={[0.04, h, 0.04]} />
            <M />
          </mesh>
        )
      })}
    </group>
  )
}

function Body({ shape, mat }) {
  const { kind, size, color, variant } = shape
  const [w, d, h] = size
  if (kind === 'feature') {
    // Newer structures (arch trellis, obelisk, arbor, cold frame) have their own
    // self-contained models; older ones fall through to the inline models below.
    const Structure = STRUCTURE_MODELS[variant]
    if (Structure) {
      // Each structure model is authored at a fixed design footprint; scale it to the
      // shape's current size (feet) so the width/depth/height controls actually resize
      // the mesh, not just the bounding box. size = [w, d, h]; design size = [w, d, h].
      const def = FEATURE_TYPES[variant]?.size
      const s = def ? [w / def[0], h / def[2], d / def[1]] : [1, 1, 1]
      return (
        <group scale={s}>
          <Structure />
        </group>
      )
    }
    if (variant === 'stake') return <Stake h={h} color={color} mat={mat} />
    if (variant === 'trellis') return <Trellis w={w} h={h} color={color} mat={mat} />
    return (
      <mesh position={[0, h / 2, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[w / 2, w / 2, h, 20]} />
        <meshStandardMaterial color={color} roughness={0.7} {...mat} />
      </mesh>
    )
  }
  return (
    <mesh position={[0, h / 2, 0]} castShadow receiveShadow>
      <boxGeometry args={[w, h, d]} />
      <meshStandardMaterial color={color} roughness={kind === 'path' ? 1 : 0.85} {...mat} />
    </mesh>
  )
}

export default function GardenShape3D({ shape, selected, onSelect, onMove, onCropMove, onDragStateChange }) {
  const { kind, pos, size, rotationY, label, crops, variant } = shape
  const [w, d, h] = size
  const [hovered, setHovered] = useState(false)
  // offset must survive the re-render that pointer-down triggers → keep it in a ref
  const dragOffset = useRef(null)

  // --- whole-shape drag (ground plane) ---
  const startShapeDrag = (e) => {
    e.stopPropagation()
    onSelect(shape.id)
    try { e.target.setPointerCapture(e.pointerId) } catch (_) {}
    const hit = new THREE.Vector3()
    e.ray.intersectPlane(GROUND, hit)
    dragOffset.current = [hit.x - pos[0], hit.z - pos[1]]
    onDragStateChange(true)
  }
  const moveShapeDrag = (e) => {
    if (!e.buttons || !dragOffset.current) return
    const hit = new THREE.Vector3()
    if (!e.ray.intersectPlane(GROUND, hit)) return
    e.stopPropagation()
    onMove(shape.id, [hit.x - dragOffset.current[0], hit.z - dragOffset.current[1]])
  }
  const endDrag = (e) => {
    try { e.target.releasePointerCapture(e.pointerId) } catch (_) {}
    dragOffset.current = null
    onDragStateChange(false)
  }

  // --- crop drag (bed-local, on the soil surface) ---
  const cropPlane = useMemo(() => new THREE.Plane(new THREE.Vector3(0, 1, 0), -(h + 0.02)), [h])
  const startCropDrag = (e) => {
    e.stopPropagation()
    onSelect(shape.id)
    try { e.target.setPointerCapture(e.pointerId) } catch (_) {}
    onDragStateChange(true)
  }
  const moveCropDrag = (e, cropId) => {
    if (!e.buttons) return
    const hit = new THREE.Vector3()
    if (!e.ray.intersectPlane(cropPlane, hit)) return
    e.stopPropagation()
    const dx = hit.x - pos[0]
    const dz = hit.z - pos[1]
    const cos = Math.cos(rotationY)
    const sin = Math.sin(rotationY)
    let lx = dx * cos - dz * sin
    let lz = dx * sin + dz * cos
    const mx = (w * 0.92) / 2 - 0.15
    const mz = (d * 0.92) / 2 - 0.15
    lx = Math.max(-mx, Math.min(mx, lx))
    lz = Math.max(-mz, Math.min(mz, lz))
    onCropMove(shape.id, cropId, [lx, lz])
  }

  const mat = selected
    ? { emissive: '#a3e635', emissiveIntensity: 0.35 }
    : hovered
    ? { emissive: '#4d7c0f', emissiveIntensity: 0.15 }
    : {}

  return (
    <group
      position={[pos[0], 0, pos[1]]}
      rotation={[0, rotationY, 0]}
      onPointerDown={startShapeDrag}
      onPointerMove={moveShapeDrag}
      onPointerUp={endDrag}
      onPointerOver={(e) => { e.stopPropagation(); setHovered(true) }}
      onPointerOut={() => setHovered(false)}
    >
      <Body shape={shape} mat={mat} />

      {/* selection outline */}
      {selected && (
        <mesh position={[0, h / 2, 0]}>
          <boxGeometry args={[w, h, d]} />
          <meshBasicMaterial transparent opacity={0} />
          <Edges scale={1.04} color="#365314" />
        </mesh>
      )}

      {/* soil top for beds */}
      {kind === 'bed' && (
        <mesh position={[0, h + 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <planeGeometry args={[w * 0.92, d * 0.92]} />
          <meshStandardMaterial color="#4a2f1c" roughness={1} />
        </mesh>
      )}

      {/* crops — each draggable within the bed */}
      {kind === 'bed' &&
        (crops || []).map((c) => (
          <group
            key={c.id}
            position={[c.pos?.[0] || 0, h + 0.02, c.pos?.[1] || 0]}
            onPointerDown={startCropDrag}
            onPointerMove={(e) => moveCropDrag(e, c.id)}
            onPointerUp={endDrag}
          >
            <Plant3D type={c.type} showLabel={selected} />
          </group>
        ))}
    </group>
  )
}
