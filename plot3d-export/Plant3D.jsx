// Plant3D.jsx
// Procedural little plant model (no external assets/models needed).
// stem + foliage clusters, plus optional: fruit berries, a flower head (sunflower),
// or a large ground fruit (watermelon/squash). Tinted per crop type.
import React, { useMemo } from 'react'
import { Billboard, Text } from '@react-three/drei'
import { CROP_TYPES } from './layout3dModel'

export default function Plant3D({ type, showLabel = false }) {
  const spec = CROP_TYPES[type] || CROP_TYPES.tomato
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

      {showLabel && (
        <Billboard position={[0, Math.max(h, 0.6) + 0.4, 0]}>
          <Text fontSize={0.3} color="#1f2937" anchorX="center" anchorY="middle" outlineWidth={0.012} outlineColor="#ffffff">
            {spec.label}
          </Text>
        </Billboard>
      )}
    </group>
  )
}
