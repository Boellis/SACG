// plantModels.jsx
// Per-crop procedural 3D models. Plant3D dispatches to PLANT_MODELS[type] and
// falls back to GenericPlant — a parametric stem + foliage + fruit/head/ground
// model driven by the crop's CROP_TYPES spec. More detailed, plant-specific
// models are registered in PLANT_MODELS below.
import { useMemo } from 'react'

// --- generic fallback: parametric plant driven by the crop spec ---------------
export function GenericPlant({ spec }) {
  const h = spec.height

  const blobs = useMemo(() => {
    const arr = []
    for (let i = 0; i < 3; i++) {
      arr.push({
        y: h * (0.55 + 0.15 * i),
        r: Math.max(0.08, 0.18 - 0.03 * i) * (1 + h * 0.05),
        x: (i % 2 === 0 ? 1 : -1) * 0.06,
        z: (i % 3 === 0 ? 1 : -1) * 0.05,
      })
    }
    return arr
  }, [h])

  const fruit = useMemo(() => {
    if (!spec.fruit) return []
    return [
      [0.1, h * 0.6, 0.05],
      [-0.08, h * 0.7, -0.06],
      [0.02, h * 0.5, 0.1],
    ]
  }, [spec.fruit, h])

  const headR = Math.min(0.55, 0.18 + h * 0.06)

  return (
    <group>
      {/* stem */}
      <mesh position={[0, h * 0.3, 0]} castShadow>
        <cylinderGeometry args={[0.03, 0.05, h * 0.6, 6]} />
        <meshStandardMaterial color="#6b4f2a" roughness={1} />
      </mesh>

      {/* foliage */}
      {blobs.map((b, i) => (
        <mesh key={i} position={[b.x, b.y, b.z]} castShadow>
          <icosahedronGeometry args={[b.r, 0]} />
          <meshStandardMaterial color={spec.foliage} roughness={0.9} flatShading />
        </mesh>
      ))}

      {/* fruit berries */}
      {fruit.map((p, i) => (
        <mesh key={i} position={p} castShadow>
          <sphereGeometry args={[0.06, 8, 8]} />
          <meshStandardMaterial color={spec.fruit} roughness={0.5} />
        </mesh>
      ))}

      {/* flower head (sunflower / flower) */}
      {spec.head && (
        <group position={[0, h, 0]}>
          <mesh castShadow>
            <sphereGeometry args={[headR, 16, 16]} />
            <meshStandardMaterial color={spec.head} roughness={0.7} />
          </mesh>
          <mesh position={[0, 0, headR * 0.5]}>
            <sphereGeometry args={[headR * 0.5, 12, 12]} />
            <meshStandardMaterial color="#6b4f2a" roughness={1} />
          </mesh>
        </group>
      )}

      {/* large ground fruit (watermelon / squash) */}
      {spec.ground && (
        <mesh position={[0.15, 0.28, 0.1]} scale={[1.4, 0.85, 1]} castShadow>
          <sphereGeometry args={[0.42, 16, 16]} />
          <meshStandardMaterial color={spec.ground} roughness={0.6} />
        </mesh>
      )}
    </group>
  )
}

// --- plant-specific models (added by the modeling agent team) -----------------
// Each is a self-contained function returning a <group> modeled in feet with its
// base at y=0. Registered by crop key in PLANT_MODELS.

// __AGENT_MODELS__

export const PLANT_MODELS = {
  // __AGENT_REGISTRY__
}
