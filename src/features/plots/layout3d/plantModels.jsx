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

function CornPlant() {
  return (
    <group>
      {/* stalk — tall single cane, thicker at the base */}
      <mesh position={[0, 3.2, 0]} castShadow>
        <cylinderGeometry args={[0.045, 0.065, 6.4, 6]} />
        <meshStandardMaterial color="#6b8e42" roughness={0.85} />
      </mesh>

      {/* leaf-collar nodes */}
      <mesh position={[0, 1.6, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <torusGeometry args={[0.062, 0.013, 5, 10]} />
        <meshStandardMaterial color="#5a7a34" roughness={0.85} />
      </mesh>
      <mesh position={[0, 4.0, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <torusGeometry args={[0.053, 0.012, 5, 10]} />
        <meshStandardMaterial color="#5a7a34" roughness={0.85} />
      </mesh>

      {/* long arching blade leaves — riser + drooping tip, alternating around the stalk, largest low on the plant */}
      <group position={[0, 1.0, 0]}>
        <mesh position={[0.44, 0.33, 0]} rotation={[0, 0, -0.85]} scale={[1, 1, 0.3]} castShadow>
          <coneGeometry args={[0.065, 1.0, 4]} />
          <meshStandardMaterial color="#5b8c3c" roughness={0.9} flatShading />
        </mesh>
        <mesh position={[1.47, 0.13, 0]} rotation={[0, 0, -2.25]} scale={[1, 1, 0.22]} castShadow>
          <coneGeometry args={[0.05, 1.7, 4]} />
          <meshStandardMaterial color="#5b8c3c" roughness={0.9} flatShading />
        </mesh>
      </group>
      <group position={[0, 1.9, 0]} rotation={[0, 1.3, 0]}>
        <mesh position={[0.42, 0.31, 0]} rotation={[0, 0, -0.85]} scale={[1, 1, 0.3]} castShadow>
          <coneGeometry args={[0.06, 0.95, 4]} />
          <meshStandardMaterial color="#4f7a2f" roughness={0.9} flatShading />
        </mesh>
        <mesh position={[1.37, 0.14, 0]} rotation={[0, 0, -2.25]} scale={[1, 1, 0.22]} castShadow>
          <coneGeometry args={[0.045, 1.55, 4]} />
          <meshStandardMaterial color="#4f7a2f" roughness={0.9} flatShading />
        </mesh>
      </group>
      <group position={[0, 2.8, 0]} rotation={[0, 2.6, 0]}>
        <mesh position={[0.38, 0.28, 0]} rotation={[0, 0, -0.85]} scale={[1, 1, 0.3]} castShadow>
          <coneGeometry args={[0.052, 0.85, 4]} />
          <meshStandardMaterial color="#5b8c3c" roughness={0.9} flatShading />
        </mesh>
        <mesh position={[1.23, 0.14, 0]} rotation={[0, 0, -2.25]} scale={[1, 1, 0.22]} castShadow>
          <coneGeometry args={[0.038, 1.35, 4]} />
          <meshStandardMaterial color="#5b8c3c" roughness={0.9} flatShading />
        </mesh>
      </group>
      <group position={[0, 3.8, 0]} rotation={[0, 4.1, 0]}>
        <mesh position={[0.32, 0.23, 0]} rotation={[0, 0, -0.85]} scale={[1, 1, 0.3]} castShadow>
          <coneGeometry args={[0.042, 0.7, 4]} />
          <meshStandardMaterial color="#4f7a2f" roughness={0.9} flatShading />
        </mesh>
        <mesh position={[1.0, 0.13, 0]} rotation={[0, 0, -2.25]} scale={[1, 1, 0.22]} castShadow>
          <coneGeometry args={[0.03, 1.05, 4]} />
          <meshStandardMaterial color="#4f7a2f" roughness={0.9} flatShading />
        </mesh>
      </group>
      <group position={[0, 4.7, 0]} rotation={[0, 5.4, 0]}>
        <mesh position={[0.27, 0.18, 0]} rotation={[0, 0, -0.85]} scale={[1, 1, 0.3]} castShadow>
          <coneGeometry args={[0.032, 0.55, 4]} />
          <meshStandardMaterial color="#5b8c3c" roughness={0.9} flatShading />
        </mesh>
        <mesh position={[0.78, 0.11, 0]} rotation={[0, 0, -2.25]} scale={[1, 1, 0.22]} castShadow>
          <coneGeometry args={[0.022, 0.8, 4]} />
          <meshStandardMaterial color="#5b8c3c" roughness={0.9} flatShading />
        </mesh>
      </group>

      {/* ears — husked cobs angled out from the stalk, roughly midway up the plant, with a golden silk tuft at the tip */}
      <group position={[0, 3.5, 0]} rotation={[0, 3.5, 0]}>
        <mesh position={[0.35, 0.11, 0]} rotation={[0, 0, -1.2]} castShadow>
          <capsuleGeometry args={[0.08, 0.42, 3, 6]} />
          <meshStandardMaterial color="#6f9748" roughness={0.9} flatShading />
        </mesh>
        <mesh position={[0.66, 0.24, 0]} rotation={[0, 0, -1.2]} castShadow>
          <coneGeometry args={[0.03, 0.16, 5]} />
          <meshStandardMaterial color="#f2c14e" roughness={0.55} flatShading />
        </mesh>
      </group>
      <group position={[0, 2.9, 0]} rotation={[0, 0.9, 0]} scale={[0.8, 0.8, 0.8]}>
        <mesh position={[0.35, 0.11, 0]} rotation={[0, 0, -1.2]} castShadow>
          <capsuleGeometry args={[0.08, 0.42, 3, 6]} />
          <meshStandardMaterial color="#6f9748" roughness={0.9} flatShading />
        </mesh>
        <mesh position={[0.66, 0.24, 0]} rotation={[0, 0, -1.2]} castShadow>
          <coneGeometry args={[0.03, 0.16, 5]} />
          <meshStandardMaterial color="#f2c14e" roughness={0.55} flatShading />
        </mesh>
      </group>

      {/* tassel plume — the male flower spike at the very top */}
      <group position={[0, 6.4, 0]}>
        <mesh position={[0, 0.3, 0]} castShadow>
          <coneGeometry args={[0.02, 0.6, 5]} />
          <meshStandardMaterial color="#c9b037" roughness={0.7} flatShading />
        </mesh>
        <group rotation={[0, 0.3, 0]}>
          <mesh position={[0.08, 0.15, 0]} rotation={[0, 0, -1.1]} castShadow>
            <coneGeometry args={[0.013, 0.4, 4]} />
            <meshStandardMaterial color="#d1b23a" roughness={0.7} flatShading />
          </mesh>
        </group>
        <group rotation={[0, 1.6, 0]}>
          <mesh position={[0.08, 0.18, 0]} rotation={[0, 0, -1.15]} castShadow>
            <coneGeometry args={[0.013, 0.38, 4]} />
            <meshStandardMaterial color="#d1b23a" roughness={0.7} flatShading />
          </mesh>
        </group>
        <group rotation={[0, 2.9, 0]}>
          <mesh position={[0.08, 0.2, 0]} rotation={[0, 0, -1.05]} castShadow>
            <coneGeometry args={[0.013, 0.42, 4]} />
            <meshStandardMaterial color="#d1b23a" roughness={0.7} flatShading />
          </mesh>
        </group>
        <group rotation={[0, 4.2, 0]}>
          <mesh position={[0.08, 0.16, 0]} rotation={[0, 0, -1.1]} castShadow>
            <coneGeometry args={[0.013, 0.36, 4]} />
            <meshStandardMaterial color="#d1b23a" roughness={0.7} flatShading />
          </mesh>
        </group>
        <group rotation={[0, 5.5, 0]}>
          <mesh position={[0.08, 0.19, 0]} rotation={[0, 0, -1.1]} castShadow>
            <coneGeometry args={[0.013, 0.4, 4]} />
            <meshStandardMaterial color="#d1b23a" roughness={0.7} flatShading />
          </mesh>
        </group>
      </group>
    </group>
  )
}

function StrawberryPlant() {
  return (
    <group>
      {/* crown / low central mound (base of the rosette, sits at soil level) */}
      <mesh position={[0, 0.055, 0]} scale={[1, 0.5, 1]} castShadow>
        <icosahedronGeometry args={[0.11, 0]} />
        <meshStandardMaterial color="#3d7a34" roughness={0.9} flatShading />
      </mesh>

      {/* leaf 1 — trifoliate (3 leaflets per leaf), radiating from the crown */}
      <group rotation={[0, 0.35, 0]}>
        <mesh position={[0, 0.245, 0.188]} rotation={[0.85, 0, 0]} castShadow>
          <cylinderGeometry args={[0.013, 0.02, 0.5, 5]} />
          <meshStandardMaterial color="#5c8a3a" roughness={0.85} />
        </mesh>
        <mesh position={[0, 0.44, 0.436]} rotation={[0.05, 0, 0]} castShadow>
          <icosahedronGeometry args={[0.085, 0]} />
          <meshStandardMaterial color="#4a9c3f" roughness={0.9} flatShading />
        </mesh>
        <mesh position={[-0.09, 0.395, 0.356]} rotation={[0.05, 0, 0.4]} castShadow>
          <icosahedronGeometry args={[0.085, 0]} />
          <meshStandardMaterial color="#4a9c3f" roughness={0.9} flatShading />
        </mesh>
        <mesh position={[0.09, 0.395, 0.356]} rotation={[0.05, 0, -0.4]} castShadow>
          <icosahedronGeometry args={[0.085, 0]} />
          <meshStandardMaterial color="#4a9c3f" roughness={0.9} flatShading />
        </mesh>
      </group>

      {/* leaf 2 */}
      <group rotation={[0, 1.92, 0]}>
        <mesh position={[0, 0.225, 0.165]} rotation={[0.85, 0, 0]} castShadow>
          <cylinderGeometry args={[0.013, 0.02, 0.44, 5]} />
          <meshStandardMaterial color="#5c8a3a" roughness={0.85} />
        </mesh>
        <mesh position={[0, 0.4, 0.391]} rotation={[0.05, 0, 0]} castShadow>
          <icosahedronGeometry args={[0.085, 0]} />
          <meshStandardMaterial color="#4a9c3f" roughness={0.9} flatShading />
        </mesh>
        <mesh position={[-0.09, 0.355, 0.311]} rotation={[0.05, 0, 0.4]} castShadow>
          <icosahedronGeometry args={[0.085, 0]} />
          <meshStandardMaterial color="#4a9c3f" roughness={0.9} flatShading />
        </mesh>
        <mesh position={[0.09, 0.355, 0.311]} rotation={[0.05, 0, -0.4]} castShadow>
          <icosahedronGeometry args={[0.085, 0]} />
          <meshStandardMaterial color="#4a9c3f" roughness={0.9} flatShading />
        </mesh>
      </group>

      {/* leaf 3 */}
      <group rotation={[0, 3.49, 0]}>
        <mesh position={[0, 0.262, 0.207]} rotation={[0.85, 0, 0]} castShadow>
          <cylinderGeometry args={[0.013, 0.02, 0.55, 5]} />
          <meshStandardMaterial color="#5c8a3a" roughness={0.85} />
        </mesh>
        <mesh position={[0, 0.473, 0.473]} rotation={[0.05, 0, 0]} castShadow>
          <icosahedronGeometry args={[0.085, 0]} />
          <meshStandardMaterial color="#4a9c3f" roughness={0.9} flatShading />
        </mesh>
        <mesh position={[-0.09, 0.428, 0.393]} rotation={[0.05, 0, 0.4]} castShadow>
          <icosahedronGeometry args={[0.085, 0]} />
          <meshStandardMaterial color="#4a9c3f" roughness={0.9} flatShading />
        </mesh>
        <mesh position={[0.09, 0.428, 0.393]} rotation={[0.05, 0, -0.4]} castShadow>
          <icosahedronGeometry args={[0.085, 0]} />
          <meshStandardMaterial color="#4a9c3f" roughness={0.9} flatShading />
        </mesh>
      </group>

      {/* leaf 4 */}
      <group rotation={[0, 5.06, 0]}>
        <mesh position={[0, 0.235, 0.177]} rotation={[0.85, 0, 0]} castShadow>
          <cylinderGeometry args={[0.013, 0.02, 0.47, 5]} />
          <meshStandardMaterial color="#5c8a3a" roughness={0.85} />
        </mesh>
        <mesh position={[0, 0.42, 0.413]} rotation={[0.05, 0, 0]} castShadow>
          <icosahedronGeometry args={[0.085, 0]} />
          <meshStandardMaterial color="#4a9c3f" roughness={0.9} flatShading />
        </mesh>
        <mesh position={[-0.09, 0.375, 0.333]} rotation={[0.05, 0, 0.4]} castShadow>
          <icosahedronGeometry args={[0.085, 0]} />
          <meshStandardMaterial color="#4a9c3f" roughness={0.9} flatShading />
        </mesh>
        <mesh position={[0.09, 0.375, 0.333]} rotation={[0.05, 0, -0.4]} castShadow>
          <icosahedronGeometry args={[0.085, 0]} />
          <meshStandardMaterial color="#4a9c3f" roughness={0.9} flatShading />
        </mesh>
      </group>

      {/* flower 1 — small 5-petal white bloom on a thin stalk, tucked among the leaves */}
      <group rotation={[0, 1.13, 0]}>
        <mesh position={[0, 0.15, 0.075]} rotation={[0.75, 0, 0]} castShadow>
          <cylinderGeometry args={[0.008, 0.012, 0.22, 5]} />
          <meshStandardMaterial color="#5c8a3a" roughness={0.85} />
        </mesh>
        <mesh position={[0, 0.241, 0.165]} scale={[1, 0.18, 1]} castShadow>
          <icosahedronGeometry args={[0.07, 0]} />
          <meshStandardMaterial color="#ffffff" roughness={0.6} flatShading />
        </mesh>
        <mesh position={[0, 0.261, 0.17]} castShadow>
          <sphereGeometry args={[0.022, 8, 8]} />
          <meshStandardMaterial color="#ffd43b" roughness={0.5} />
        </mesh>
      </group>

      {/* flower 2 */}
      <group rotation={[0, 4.28, 0]}>
        <mesh position={[0, 0.14, 0.065]} rotation={[0.75, 0, 0]} castShadow>
          <cylinderGeometry args={[0.008, 0.012, 0.19, 5]} />
          <meshStandardMaterial color="#5c8a3a" roughness={0.85} />
        </mesh>
        <mesh position={[0, 0.219, 0.145]} scale={[1, 0.18, 1]} castShadow>
          <icosahedronGeometry args={[0.07, 0]} />
          <meshStandardMaterial color="#ffffff" roughness={0.6} flatShading />
        </mesh>
        <mesh position={[0, 0.239, 0.15]} castShadow>
          <sphereGeometry args={[0.022, 8, 8]} />
          <meshStandardMaterial color="#ffd43b" roughness={0.5} />
        </mesh>
      </group>

      {/* berry 1 — ripe fruit drooping on its stem to rest near the soil (signature trait) */}
      <group rotation={[0, 2.71, 0]}>
        <mesh position={[0, 0.044, 0.1]} rotation={[2.0, 0, 0]} castShadow>
          <cylinderGeometry args={[0.01, 0.014, 0.22, 5]} />
          <meshStandardMaterial color="#5c8a3a" roughness={0.85} />
        </mesh>
        <mesh position={[0, 0.065, 0.205]} rotation={[Math.PI, 0, 0]} castShadow>
          <coneGeometry args={[0.075, 0.13, 7]} />
          <meshStandardMaterial color="#c92a2a" roughness={0.45} />
        </mesh>
        <mesh position={[0, 0.14, 0.205]} scale={[1, 0.4, 1]} castShadow>
          <icosahedronGeometry args={[0.05, 0]} />
          <meshStandardMaterial color="#4a9c3f" roughness={0.9} flatShading />
        </mesh>
      </group>

      {/* berry 2 — smaller, still lifted just under the canopy */}
      <group rotation={[0, 5.85, 0]}>
        <mesh position={[0, 0.077, 0.099]} rotation={[1.7, 0, 0]} castShadow>
          <cylinderGeometry args={[0.009, 0.013, 0.2, 5]} />
          <meshStandardMaterial color="#5c8a3a" roughness={0.85} />
        </mesh>
        <mesh position={[0, 0.12, 0.2]} rotation={[Math.PI, 0, 0]} castShadow>
          <coneGeometry args={[0.065, 0.11, 7]} />
          <meshStandardMaterial color="#c92a2a" roughness={0.45} />
        </mesh>
        <mesh position={[0, 0.185, 0.2]} scale={[1, 0.4, 1]} castShadow>
          <icosahedronGeometry args={[0.045, 0]} />
          <meshStandardMaterial color="#4a9c3f" roughness={0.9} flatShading />
        </mesh>
      </group>
    </group>
  )
}

function CucumberPlant() {
  return (
    <group>
      {/* crown / base of the plant */}
      <mesh position={[0, 0.09, 0]} castShadow>
        <cylinderGeometry args={[0.05, 0.065, 0.18, 6]} />
        <meshStandardMaterial color="#4d7c32" roughness={0.95} />
      </mesh>

      {/* low sprawling runner - trails left/back along the ground */}
      <mesh position={[-0.22, 0.15, -0.12]} rotation={[0, 0, 1.15]} castShadow>
        <cylinderGeometry args={[0.035, 0.045, 0.42, 6]} />
        <meshStandardMaterial color="#4d7c32" roughness={0.95} />
      </mesh>
      <mesh position={[-0.62, 0.11, -0.36]} rotation={[0, 0, 1.3]} castShadow>
        <cylinderGeometry args={[0.03, 0.035, 0.4, 6]} />
        <meshStandardMaterial color="#4d7c32" roughness={0.95} />
      </mesh>

      {/* low sprawling runner - trails right/back along the ground */}
      <mesh position={[0.15, 0.16, 0.32]} rotation={[1.1, 0, 0]} castShadow>
        <cylinderGeometry args={[0.035, 0.045, 0.42, 6]} />
        <meshStandardMaterial color="#4d7c32" roughness={0.95} />
      </mesh>
      <mesh position={[0.26, 0.13, 0.68]} rotation={[1.25, 0, 0]} castShadow>
        <cylinderGeometry args={[0.03, 0.035, 0.38, 6]} />
        <meshStandardMaterial color="#4d7c32" roughness={0.95} />
      </mesh>

      {/* climbing runner - rises to the plant's full ~1.5ft height */}
      <mesh position={[0.16, 0.34, 0.05]} rotation={[0, 0, -0.35]} castShadow>
        <cylinderGeometry args={[0.04, 0.05, 0.5, 6]} />
        <meshStandardMaterial color="#4d7c32" roughness={0.95} />
      </mesh>
      <mesh position={[0.34, 0.78, 0.1]} rotation={[0, 0, -0.18]} castShadow>
        <cylinderGeometry args={[0.035, 0.04, 0.55, 6]} />
        <meshStandardMaterial color="#4d7c32" roughness={0.95} />
      </mesh>
      <mesh position={[0.36, 1.28, 0.08]} rotation={[0, 0, -0.1]} castShadow>
        <cylinderGeometry args={[0.028, 0.035, 0.44, 6]} />
        <meshStandardMaterial color="#4d7c32" roughness={0.95} />
      </mesh>

      {/* coiling tendrils gripping the climb */}
      <mesh position={[0.4, 1.0, 0.13]} rotation={[1.3, 0.4, 0]} castShadow>
        <torusGeometry args={[0.05, 0.008, 6, 10]} />
        <meshStandardMaterial color="#4d7c32" roughness={0.9} />
      </mesh>
      <mesh position={[0.28, 0.58, 0.1]} rotation={[0.9, -0.3, 0]} castShadow>
        <torusGeometry args={[0.045, 0.007, 6, 10]} />
        <meshStandardMaterial color="#4d7c32" roughness={0.9} />
      </mesh>

      {/* big lobed leaves - flattened faceted blobs with pointed lobe-tip accents */}
      <mesh position={[-0.15, 0.2, -0.08]} rotation={[0.3, 0.4, 0.15]} scale={[1.5, 0.35, 1.3]} castShadow>
        <icosahedronGeometry args={[0.22, 0]} />
        <meshStandardMaterial color="#3f9142" roughness={0.85} flatShading />
      </mesh>
      <mesh position={[-0.32, 0.19, -0.14]} rotation={[0.2, 0.5, 0.2]} scale={[1, 0.6, 1]} castShadow>
        <tetrahedronGeometry args={[0.08, 0]} />
        <meshStandardMaterial color="#3f9142" roughness={0.85} flatShading />
      </mesh>

      <mesh position={[0.06, 0.26, -0.06]} rotation={[-0.2, -0.5, 0.1]} scale={[1.4, 0.32, 1.25]} castShadow>
        <icosahedronGeometry args={[0.2, 0]} />
        <meshStandardMaterial color="#357a38" roughness={0.85} flatShading />
      </mesh>

      <mesh position={[-0.58, 0.15, -0.35]} rotation={[0.1, 0.8, -0.15]} scale={[1.5, 0.3, 1.3]} castShadow>
        <icosahedronGeometry args={[0.24, 0]} />
        <meshStandardMaterial color="#3f9142" roughness={0.85} flatShading />
      </mesh>
      <mesh position={[-0.78, 0.15, -0.42]} rotation={[0.1, 0.9, 0]} scale={[1, 0.55, 1]} castShadow>
        <tetrahedronGeometry args={[0.09, 0]} />
        <meshStandardMaterial color="#3f9142" roughness={0.85} flatShading />
      </mesh>

      <mesh position={[-0.82, 0.17, -0.4]} rotation={[-0.1, 0.3, 0.2]} scale={[1.3, 0.28, 1.15]} castShadow>
        <icosahedronGeometry args={[0.19, 0]} />
        <meshStandardMaterial color="#357a38" roughness={0.85} flatShading />
      </mesh>

      <mesh position={[0.18, 0.19, 0.34]} rotation={[0.15, -0.6, -0.1]} scale={[1.4, 0.3, 1.25]} castShadow>
        <icosahedronGeometry args={[0.21, 0]} />
        <meshStandardMaterial color="#3f9142" roughness={0.85} flatShading />
      </mesh>
      <mesh position={[0.32, 0.18, 0.46]} rotation={[0.1, -0.7, 0]} scale={[1, 0.55, 1]} castShadow>
        <tetrahedronGeometry args={[0.085, 0]} />
        <meshStandardMaterial color="#3f9142" roughness={0.85} flatShading />
      </mesh>

      <mesh position={[0.28, 0.21, 0.82]} rotation={[-0.2, -0.2, 0.1]} scale={[1.25, 0.28, 1.1]} castShadow>
        <icosahedronGeometry args={[0.18, 0]} />
        <meshStandardMaterial color="#357a38" roughness={0.85} flatShading />
      </mesh>

      <mesh position={[0.42, 0.85, 0.18]} rotation={[0.3, 0.5, -0.2]} scale={[1.4, 0.32, 1.2]} castShadow>
        <icosahedronGeometry args={[0.2, 0]} />
        <meshStandardMaterial color="#3f9142" roughness={0.85} flatShading />
      </mesh>
      <mesh position={[0.58, 0.9, 0.28]} rotation={[0.2, 0.6, 0]} scale={[1, 0.5, 1]} castShadow>
        <tetrahedronGeometry args={[0.08, 0]} />
        <meshStandardMaterial color="#3f9142" roughness={0.85} flatShading />
      </mesh>

      <mesh position={[0.4, 1.42, 0.14]} rotation={[-0.15, 0.4, 0.15]} scale={[1.2, 0.3, 1.05]} castShadow>
        <icosahedronGeometry args={[0.16, 0]} />
        <meshStandardMaterial color="#357a38" roughness={0.85} flatShading />
      </mesh>

      {/* small flat yellow star flowers - 5-sided cone blooms (mini cucurbit trumpet, flipped so the star rim faces up/out) with a tiny contrasting center, tucked at the vine */}
      <mesh position={[0.02, 0.31, -0.02]} rotation={[2.95, 0.4, 0.15]} castShadow>
        <coneGeometry args={[0.065, 0.05, 5]} />
        <meshStandardMaterial color="#ffd43b" roughness={0.5} flatShading />
      </mesh>
      <mesh position={[0.028, 0.328, -0.032]}>
        <sphereGeometry args={[0.016, 6, 6]} />
        <meshStandardMaterial color="#e8890c" roughness={0.5} />
      </mesh>

      <mesh position={[-0.5, 0.17, -0.3]} rotation={[3.05, -0.3, 0.5]} castShadow>
        <coneGeometry args={[0.065, 0.05, 5]} />
        <meshStandardMaterial color="#ffd43b" roughness={0.5} flatShading />
      </mesh>
      <mesh position={[-0.508, 0.188, -0.316]}>
        <sphereGeometry args={[0.016, 6, 6]} />
        <meshStandardMaterial color="#e8890c" roughness={0.5} />
      </mesh>

      <mesh position={[0.22, 0.21, 0.4]} rotation={[2.85, 0.2, -0.3]} castShadow>
        <coneGeometry args={[0.065, 0.05, 5]} />
        <meshStandardMaterial color="#ffd43b" roughness={0.5} flatShading />
      </mesh>
      <mesh position={[0.212, 0.227, 0.409]}>
        <sphereGeometry args={[0.016, 6, 6]} />
        <meshStandardMaterial color="#e8890c" roughness={0.5} />
      </mesh>

      <mesh position={[0.46, 1.06, 0.22]} rotation={[3.0, 0.5, 0.1]} castShadow>
        <coneGeometry args={[0.058, 0.042, 5]} />
        <meshStandardMaterial color="#ffd43b" roughness={0.5} flatShading />
      </mesh>
      <mesh position={[0.452, 1.075, 0.213]}>
        <sphereGeometry args={[0.014, 6, 6]} />
        <meshStandardMaterial color="#e8890c" roughness={0.5} />
      </mesh>

      {/* long tapered green cucumbers */}
      <mesh position={[-0.68, 0.11, -0.28]} rotation={[0, 0, 1.45]} castShadow>
        <capsuleGeometry args={[0.065, 0.5, 4, 8]} />
        <meshStandardMaterial color="#2f6b32" roughness={0.55} />
      </mesh>
      <mesh position={[-0.98, 0.13, -0.28]} castShadow>
        <sphereGeometry args={[0.05, 8, 6]} />
        <meshStandardMaterial color="#cfe0a0" roughness={0.6} />
      </mesh>

      <mesh position={[0.48, 0.62, 0.24]} rotation={[3.0, 0, 0]} castShadow>
        <capsuleGeometry args={[0.06, 0.42, 4, 8]} />
        <meshStandardMaterial color="#336f38" roughness={0.55} />
      </mesh>
      <mesh position={[0.49, 0.34, 0.29]} castShadow>
        <sphereGeometry args={[0.045, 8, 6]} />
        <meshStandardMaterial color="#cfe0a0" roughness={0.6} />
      </mesh>
    </group>
  )
}

function ZucchiniPlant() {
  return (
    <group>
      {/* crown: zucchini has no single woody stem — thick petioles fan out from a low basal crown */}
      <mesh position={[0, 0.115, 0]} scale={[1.3, 0.6, 1.3]} castShadow>
        <icosahedronGeometry args={[0.19, 0]} />
        <meshStandardMaterial color="#5f8f3a" roughness={0.9} flatShading />
      </mesh>

      {/* petioles (leaf stalks) radiating from the crown */}
      <mesh position={[0.26, 0.75, 0.1]} rotation={[0.15, 0, -0.38]} castShadow>
        <cylinderGeometry args={[0.022, 0.05, 1.4, 5]} />
        <meshStandardMaterial color="#5f8f3a" roughness={0.9} />
      </mesh>
      <mesh position={[-0.03, 0.68, 0.31]} rotation={[0.49, 0, 0.04]} castShadow>
        <cylinderGeometry args={[0.02, 0.048, 1.31, 5]} />
        <meshStandardMaterial color="#5f8f3a" roughness={0.9} />
      </mesh>
      <mesh position={[-0.33, 0.59, 0.09]} rotation={[0.18, 0, 0.6]} castShadow>
        <cylinderGeometry args={[0.02, 0.046, 1.19, 5]} />
        <meshStandardMaterial color="#5f8f3a" roughness={0.9} />
      </mesh>
      <mesh position={[-0.18, 0.66, -0.25]} rotation={[-0.43, 0, 0.31]} castShadow>
        <cylinderGeometry args={[0.021, 0.048, 1.27, 5]} />
        <meshStandardMaterial color="#5f8f3a" roughness={0.9} />
      </mesh>
      <mesh position={[0.34, 0.5, -0.12]} rotation={[-0.3, 0, -0.71]} castShadow>
        <cylinderGeometry args={[0.024, 0.05, 1.07, 5]} />
        <meshStandardMaterial color="#5f8f3a" roughness={0.9} />
      </mesh>

      {/* huge palmate lobed leaves atop each petiole — flattened, faceted blades */}
      <mesh position={[0.52, 1.42, 0.19]} rotation={[0.08, 0, -0.19]} scale={[1.35, 0.22, 1.15]} castShadow>
        <icosahedronGeometry args={[0.46, 0]} />
        <meshStandardMaterial color="#2e6b34" roughness={0.9} flatShading />
      </mesh>
      <mesh position={[-0.05, 1.28, 0.62]} rotation={[0.25, 0, 0.02]} scale={[1.15, 0.22, 1.35]} castShadow>
        <icosahedronGeometry args={[0.44, 0]} />
        <meshStandardMaterial color="#2e6b34" roughness={0.9} flatShading />
      </mesh>
      <mesh position={[-0.66, 1.1, 0.18]} rotation={[0.09, 0, 0.3]} scale={[1.3, 0.22, 1.1]} castShadow>
        <icosahedronGeometry args={[0.42, 0]} />
        <meshStandardMaterial color="#2e6b34" roughness={0.9} flatShading />
      </mesh>
      <mesh position={[-0.36, 1.24, -0.51]} rotation={[-0.22, 0, 0.16]} scale={[1.2, 0.22, 1.3]} castShadow>
        <icosahedronGeometry args={[0.44, 0]} />
        <meshStandardMaterial color="#2e6b34" roughness={0.9} flatShading />
      </mesh>
      <mesh position={[0.68, 0.92, -0.25]} rotation={[-0.15, 0, -0.35]} scale={[1.4, 0.2, 1.25]} castShadow>
        <icosahedronGeometry args={[0.5, 0]} />
        <meshStandardMaterial color="#2e6b34" roughness={0.9} flatShading />
      </mesh>

      {/* pale silvery mottling along the veins — a signature zucchini leaf marking.
          Coplanar overlay sitting flush on the leaf blade beneath it, so castShadow is
          intentionally omitted here to avoid self-shadowing (shadow acne) on the same leaf. */}
      <mesh position={[0.31, 1.48, 0.11]} scale={[1.2, 0.3, 1]}>
        <icosahedronGeometry args={[0.22, 0]} />
        <meshStandardMaterial color="#9fbf6f" roughness={0.85} flatShading />
      </mesh>
      <mesh position={[-0.4, 1.16, 0.11]} scale={[1.1, 0.3, 1.15]}>
        <icosahedronGeometry args={[0.2, 0]} />
        <meshStandardMaterial color="#9fbf6f" roughness={0.85} flatShading />
      </mesh>

      {/* pointed lobe tip on the largest, lowest leaf */}
      <mesh position={[0.85, 0.9, -0.31]} rotation={[0, 0, -1]} castShadow>
        <coneGeometry args={[0.09, 0.22, 5]} />
        <meshStandardMaterial color="#2e6b34" roughness={0.9} flatShading />
      </mesh>

      {/* flower: showy yellow-orange 5-lobed trumpet on a thin stalk */}
      <mesh position={[0.12, 0.38, -0.05]} rotation={[0.1, 0, 0.15]} castShadow>
        <cylinderGeometry args={[0.012, 0.02, 0.62, 5]} />
        <meshStandardMaterial color="#5f8f3a" roughness={0.9} />
      </mesh>
      <mesh position={[0.16, 0.7, -0.08]} rotation={[3.14159, 0, 0.2]} castShadow>
        <coneGeometry args={[0.11, 0.16, 5]} />
        <meshStandardMaterial color="#f5b942" roughness={0.55} flatShading />
      </mesh>
      <mesh position={[0.16, 0.66, -0.08]} castShadow>
        <sphereGeometry args={[0.035, 6, 6]} />
        <meshStandardMaterial color="#e8890c" roughness={0.5} />
      </mesh>

      {/* fruit: elongated green zucchini resting near the base, under the canopy */}
      <mesh position={[0.22, 0.135, 0.3]} rotation={[0.25, 0.3, 1.45]} castShadow>
        <capsuleGeometry args={[0.085, 0.5, 4, 8]} />
        <meshStandardMaterial color="#2f5d2a" roughness={0.65} />
      </mesh>
      <mesh position={[0.3, 0.17, 0.34]} scale={[1.3, 0.5, 1]} castShadow>
        <icosahedronGeometry args={[0.035, 0]} />
        <meshStandardMaterial color="#6fa050" roughness={0.7} flatShading />
      </mesh>
      <mesh position={[-0.15, 0.1, 0.2]} rotation={[0.1, 0.6, 1.3]} castShadow>
        <capsuleGeometry args={[0.05, 0.26, 4, 8]} />
        <meshStandardMaterial color="#3a6b30" roughness={0.65} />
      </mesh>
      <mesh position={[-0.28, 0.13, 0.3]} rotation={[0.1, 0.6, 1.3]} castShadow>
        <coneGeometry args={[0.035, 0.06, 5]} />
        <meshStandardMaterial color="#f0b23a" roughness={0.6} />
      </mesh>
    </group>
  )
}

function KalePlant() {
  const leaves = [
    { y: 0.48, ry: 0.35, tilt: 0.55,  pLen: 0.22, pr: 0.027, br: 0.29, bs: [1.05, 0.22, 1.25], c: '#3f6b57' },
    { y: 0.50, ry: 2.44, tilt: 0.60,  pLen: 0.23, pr: 0.028, br: 0.30, bs: [1.0, 0.2, 1.3],    c: '#3f6b57' },
    { y: 0.46, ry: 4.54, tilt: 0.50,  pLen: 0.21, pr: 0.026, br: 0.28, bs: [1.05, 0.22, 1.2],   c: '#3f6b57' },
    { y: 0.70, ry: 1.40, tilt: -0.40, pLen: 0.21, pr: 0.022, br: 0.27, bs: [1.0, 0.22, 1.15],   c: '#4f7f68' },
    { y: 0.72, ry: 3.49, tilt: -0.48, pLen: 0.22, pr: 0.022, br: 0.28, bs: [0.95, 0.2, 1.2],    c: '#4f7f68' },
    { y: 0.68, ry: 5.59, tilt: -0.36, pLen: 0.20, pr: 0.021, br: 0.26, bs: [1.0, 0.22, 1.1],    c: '#4f7f68' },
    { y: 0.88, ry: 0.17, tilt: -1.05, pLen: 0.07, pr: 0.016, br: 0.19, bs: [0.9, 0.24, 0.95],   c: '#5f9478' },
    { y: 0.91, ry: 2.27, tilt: -1.15, pLen: 0.08, pr: 0.016, br: 0.20, bs: [0.85, 0.22, 1.0],   c: '#5f9478' },
    { y: 0.86, ry: 4.36, tilt: -1.0,  pLen: 0.06, pr: 0.015, br: 0.18, bs: [0.9, 0.24, 0.9],    c: '#5f9478' },
  ]
  // fixed stations along a blade's length (0 = base near petiole, 1 = leaf tip) — used to
  // ring both edges with crimped ruffle flaps; the envelope bulges mid-blade like a real leaf
  const stations = [0.2, 0.5, 0.8]

  return (
    <group>
      {/* central fibrous stem */}
      <mesh position={[0, 0.25, 0]} castShadow>
        <cylinderGeometry args={[0.045, 0.065, 0.5, 6]} />
        <meshStandardMaterial color="#6b7a4a" roughness={0.95} />
      </mesh>

      {/* leaves: pale petiole + blistered blade rimmed with tightly crimped ruffle flaps, radiating in tiers */}
      {leaves.map((l, i) => {
        const rx = l.br * l.bs[0]
        const rz = l.br * l.bs[2]
        const cz = l.pLen + l.br * 0.55
        const backZ = cz - rz * 0.92
        const spanZ = rz * 1.86
        const toothR = l.br * 0.24
        const toothH = l.br * 0.5
        return (
          <group key={i} position={[0, l.y, 0]} rotation={[0, l.ry, 0]}>
            <group rotation={[l.tilt, 0, 0]}>
              {/* pale petiole */}
              <mesh position={[0, 0, l.pLen / 2]} rotation={[1.5708, 0, 0]} castShadow>
                <cylinderGeometry args={[l.pr * 0.8, l.pr, l.pLen, 5]} />
                <meshStandardMaterial color="#a9c08f" roughness={0.85} />
              </mesh>

              {/* blade body — subdivided icosahedron reads as blistered/savoyed, not a smooth gem */}
              <mesh position={[0, 0.03, cz]} scale={l.bs} castShadow>
                <icosahedronGeometry args={[l.br, 1]} />
                <meshStandardMaterial color={l.c} roughness={0.8} flatShading />
              </mesh>

              {/* crimped ruffle flaps down both edges of the blade — the tight curly-kale margin */}
              {stations.map((t, k) => {
                const env = 4 * t * (1 - t)
                const sf = 0.75 + 0.5 * env
                const z = backZ + t * spanZ
                const flip = k % 2 === 0 ? 1 : -1
                const xEdge = rx * (0.5 + 0.55 * env)
                return (
                  <group key={k}>
                    <mesh
                      position={[-xEdge, 0.03 + flip * 0.03, z]}
                      rotation={[0.2, -0.6, -flip * 0.8]}
                      scale={[0.5 * sf, 0.3 * sf, 0.42 * sf]}
                      castShadow
                    >
                      <coneGeometry args={[toothR, toothH, 4]} />
                      <meshStandardMaterial color={l.c} roughness={0.8} flatShading />
                    </mesh>
                    <mesh
                      position={[xEdge, 0.03 - flip * 0.03, z]}
                      rotation={[0.2, 0.6, flip * 0.8]}
                      scale={[0.5 * sf, 0.3 * sf, 0.42 * sf]}
                      castShadow
                    >
                      <coneGeometry args={[toothR, toothH, 4]} />
                      <meshStandardMaterial color={l.c} roughness={0.8} flatShading />
                    </mesh>
                  </group>
                )
              })}

              {/* crimped tip crest closing the ruffle ring at the leaf's rounded end */}
              <mesh position={[0, 0.05, cz + rz * 0.95]} rotation={[1.3, 0, 0]} scale={[0.5, 0.32, 0.4]} castShadow>
                <coneGeometry args={[toothR, toothH, 4]} />
                <meshStandardMaterial color={l.c} roughness={0.8} flatShading />
              </mesh>
            </group>
          </group>
        )
      })}

      {/* apex bud: small curled young leaves at the growing point */}
      <mesh position={[0, 1.34, 0]} castShadow>
        <icosahedronGeometry args={[0.1, 1]} />
        <meshStandardMaterial color="#6fa384" roughness={0.8} flatShading />
      </mesh>
    </group>
  )
}

function CabbagePlant() {
  const outerLeaves = [
    { x: 0.30, z: 0, ry: 0 },
    { x: 0, z: 0.30, ry: -1.5708 },
    { x: -0.30, z: 0, ry: 3.1416 },
    { x: 0, z: -0.30, ry: 1.5708 },
  ]
  const wrapLeaves = [
    { x: 0.19, z: 0.19, ry: -0.7854 },
    { x: -0.19, z: 0.19, ry: -2.3562 },
    { x: -0.19, z: -0.19, ry: 2.3562 },
    { x: 0.19, z: -0.19, ry: 0.7854 },
  ]
  const curlTips = [
    { x: 0.1, z: 0.05, ry: -0.6 },
    { x: -0.09, z: -0.07, ry: 2.4 },
  ]

  return (
    <group>
      {/* short stout root-crown stem, mostly hidden under the leaf skirt */}
      <mesh position={[0, 0.04, 0]} castShadow>
        <cylinderGeometry args={[0.1, 0.14, 0.08, 8]} />
        <meshStandardMaterial color="#7c8f5e" roughness={0.9} />
      </mesh>

      {/* loose outer skirt leaves - older, darker, splayed low and wide */}
      {outerLeaves.map((l, i) => (
        <mesh key={`o${i}`} position={[l.x, 0.15, l.z]} rotation={[0.15, l.ry, 0]} scale={[1.6, 0.3, 0.9]} castShadow>
          <icosahedronGeometry args={[0.24, 0]} />
          <meshStandardMaterial color="#4f7a5e" roughness={0.85} flatShading />
        </mesh>
      ))}

      {/* inner wrap leaves - tighter, higher, cupping up around the head */}
      {wrapLeaves.map((l, i) => (
        <mesh key={`w${i}`} position={[l.x, 0.34, l.z]} rotation={[-0.15, l.ry, 0]} scale={[1.4, 0.35, 0.85]} castShadow>
          <icosahedronGeometry args={[0.2, 0]} />
          <meshStandardMaterial color="#7fa583" roughness={0.85} flatShading />
        </mesh>
      ))}

      {/* tight, slightly flattened pale blue-green head */}
      <mesh position={[0, 0.48, 0]} scale={[1, 0.86, 1]} castShadow>
        <icosahedronGeometry args={[0.33, 1]} />
        <meshStandardMaterial color="#a3c2a8" roughness={0.75} flatShading />
      </mesh>

      {/* small pale innermost leaf tips just curling over the crown */}
      {curlTips.map((l, i) => (
        <mesh key={`c${i}`} position={[l.x, 0.74, l.z]} rotation={[0.3, l.ry, 0]} scale={[1.3, 0.5, 0.8]} castShadow>
          <icosahedronGeometry args={[0.09, 0]} />
          <meshStandardMaterial color="#c3d9ae" roughness={0.8} flatShading />
        </mesh>
      ))}
    </group>
  )
}

function BroccoliPlant() {
  return (
    <group>
      {/* central stalk — thickens upward toward the crown */}
      <mesh position={[0, 0.475, 0]} castShadow>
        <cylinderGeometry args={[0.13, 0.08, 0.95, 7]} />
        <meshStandardMaterial color="#7c9a5c" roughness={0.85} />
      </mesh>

      {/* lower rosette leaves — big, blue-green, arch out and droop down */}
      <group rotation={[0, 0, 0]}>
        <mesh position={[0, 0.34, 0.15]} rotation={[2.234, 0, 0]} scale={[1.7, 1, 0.32]} castShadow>
          <capsuleGeometry args={[0.075, 0.46, 2, 6]} />
          <meshStandardMaterial color="#52735a" roughness={0.9} flatShading />
        </mesh>
      </group>
      <group rotation={[0, 1.2566, 0]}>
        <mesh position={[0, 0.34, 0.15]} rotation={[2.234, 0, 0]} scale={[1.7, 1, 0.32]} castShadow>
          <capsuleGeometry args={[0.075, 0.46, 2, 6]} />
          <meshStandardMaterial color="#52735a" roughness={0.9} flatShading />
        </mesh>
      </group>
      <group rotation={[0, 2.5133, 0]}>
        <mesh position={[0, 0.34, 0.15]} rotation={[2.234, 0, 0]} scale={[1.7, 1, 0.32]} castShadow>
          <capsuleGeometry args={[0.075, 0.46, 2, 6]} />
          <meshStandardMaterial color="#52735a" roughness={0.9} flatShading />
        </mesh>
      </group>
      <group rotation={[0, 3.7699, 0]}>
        <mesh position={[0, 0.34, 0.15]} rotation={[2.234, 0, 0]} scale={[1.7, 1, 0.32]} castShadow>
          <capsuleGeometry args={[0.075, 0.46, 2, 6]} />
          <meshStandardMaterial color="#52735a" roughness={0.9} flatShading />
        </mesh>
      </group>
      <group rotation={[0, 5.0265, 0]}>
        <mesh position={[0, 0.34, 0.15]} rotation={[2.234, 0, 0]} scale={[1.7, 1, 0.32]} castShadow>
          <capsuleGeometry args={[0.075, 0.46, 2, 6]} />
          <meshStandardMaterial color="#52735a" roughness={0.9} flatShading />
        </mesh>
      </group>

      {/* upper leaves — smaller, cup upward and inward around the crown */}
      <group rotation={[0, 0.7854, 0]}>
        <mesh position={[0, 0.75, 0.11]} rotation={[0.96, 0, 0]} scale={[1.5, 1, 0.3]} castShadow>
          <capsuleGeometry args={[0.06, 0.34, 2, 6]} />
          <meshStandardMaterial color="#6f9068" roughness={0.85} flatShading />
        </mesh>
      </group>
      <group rotation={[0, 2.3562, 0]}>
        <mesh position={[0, 0.75, 0.11]} rotation={[0.96, 0, 0]} scale={[1.5, 1, 0.3]} castShadow>
          <capsuleGeometry args={[0.06, 0.34, 2, 6]} />
          <meshStandardMaterial color="#6f9068" roughness={0.85} flatShading />
        </mesh>
      </group>
      <group rotation={[0, 3.927, 0]}>
        <mesh position={[0, 0.75, 0.11]} rotation={[0.96, 0, 0]} scale={[1.5, 1, 0.3]} castShadow>
          <capsuleGeometry args={[0.06, 0.34, 2, 6]} />
          <meshStandardMaterial color="#6f9068" roughness={0.85} flatShading />
        </mesh>
      </group>
      <group rotation={[0, 5.4978, 0]}>
        <mesh position={[0, 0.75, 0.11]} rotation={[0.96, 0, 0]} scale={[1.5, 1, 0.3]} castShadow>
          <capsuleGeometry args={[0.06, 0.34, 2, 6]} />
          <meshStandardMaterial color="#6f9068" roughness={0.85} flatShading />
        </mesh>
      </group>

      {/* small bracts peeking out from beneath the crown */}
      <group rotation={[0, 1.5708, 0]}>
        <mesh position={[0, 0.93, 0.27]} rotation={[1.2217, 0, 0]} castShadow>
          <coneGeometry args={[0.05, 0.18, 5]} />
          <meshStandardMaterial color="#5c7f5f" roughness={0.85} flatShading />
        </mesh>
      </group>
      <group rotation={[0, 4.7124, 0]}>
        <mesh position={[0, 0.93, 0.27]} rotation={[1.2217, 0, 0]} castShadow>
          <coneGeometry args={[0.05, 0.18, 5]} />
          <meshStandardMaterial color="#5c7f5f" roughness={0.85} flatShading />
        </mesh>
      </group>

      {/* dense crown head — the main broccoli floret dome */}
      <mesh position={[0, 1.15, 0]} scale={[1.05, 0.85, 1.05]} castShadow>
        <icosahedronGeometry args={[0.32, 1]} />
        <meshStandardMaterial color="#3a5540" roughness={0.8} flatShading />
      </mesh>

      {/* apex floret bump */}
      <mesh position={[0, 1.4546, 0]} castShadow>
        <icosahedronGeometry args={[0.09, 0]} />
        <meshStandardMaterial color="#435f46" roughness={0.8} flatShading />
      </mesh>

      {/* upper ring of floret bumps */}
      <group position={[0, 1.15, 0]} rotation={[0, 0, 0]}>
        <mesh position={[0, 0.2761, 0.159]} castShadow>
          <icosahedronGeometry args={[0.085, 0]} />
          <meshStandardMaterial color="#3a5540" roughness={0.8} flatShading />
        </mesh>
      </group>
      <group position={[0, 1.15, 0]} rotation={[0, 2.0944, 0]}>
        <mesh position={[0, 0.2761, 0.159]} castShadow>
          <icosahedronGeometry args={[0.085, 0]} />
          <meshStandardMaterial color="#435f46" roughness={0.8} flatShading />
        </mesh>
      </group>
      <group position={[0, 1.15, 0]} rotation={[0, 4.1888, 0]}>
        <mesh position={[0, 0.2761, 0.159]} castShadow>
          <icosahedronGeometry args={[0.085, 0]} />
          <meshStandardMaterial color="#3a5540" roughness={0.8} flatShading />
        </mesh>
      </group>

      {/* lower ring of floret bumps */}
      <group position={[0, 1.15, 0]} rotation={[0, 0.7854, 0]}>
        <mesh position={[0, 0.143, 0.3323]} castShadow>
          <icosahedronGeometry args={[0.095, 0]} />
          <meshStandardMaterial color="#435f46" roughness={0.8} flatShading />
        </mesh>
      </group>
      <group position={[0, 1.15, 0]} rotation={[0, 2.3562, 0]}>
        <mesh position={[0, 0.143, 0.3323]} castShadow>
          <icosahedronGeometry args={[0.095, 0]} />
          <meshStandardMaterial color="#3a5540" roughness={0.8} flatShading />
        </mesh>
      </group>
      <group position={[0, 1.15, 0]} rotation={[0, 3.927, 0]}>
        <mesh position={[0, 0.143, 0.3323]} castShadow>
          <icosahedronGeometry args={[0.095, 0]} />
          <meshStandardMaterial color="#435f46" roughness={0.8} flatShading />
        </mesh>
      </group>
      <group position={[0, 1.15, 0]} rotation={[0, 5.4978, 0]}>
        <mesh position={[0, 0.143, 0.3323]} castShadow>
          <icosahedronGeometry args={[0.095, 0]} />
          <meshStandardMaterial color="#3a5540" roughness={0.8} flatShading />
        </mesh>
      </group>
    </group>
  )
}

function OnionPlant() {
  return (
    <group>
      {/* bulb: small golden-tan onion swelling at the soil surface */}
      <mesh position={[0, 0.09, 0]} scale={[1.15, 0.85, 1.15]} castShadow>
        <sphereGeometry args={[0.11, 8, 6]} />
        <meshStandardMaterial color="#c69a52" roughness={0.75} />
      </mesh>

      {/* neck / pale sheath collar where the leaf blades emerge */}
      <mesh position={[0, 0.24, 0]} castShadow>
        <cylinderGeometry args={[0.04, 0.065, 0.12, 6]} />
        <meshStandardMaterial color="#e2e8d5" roughness={0.85} />
      </mesh>

      {/* clump of tall hollow blue-green tubular leaves, staggered ~1.16-1.5ft */}
      <group position={[0, 0.26, 0]} rotation={[0, 0.175, 0]}>
        <mesh position={[0, 0.619, 0.087]} rotation={[0.14, 0, 0]} castShadow>
          <cylinderGeometry args={[0.007, 0.021, 1.25, 6]} />
          <meshStandardMaterial color="#5f9080" roughness={0.85} flatShading />
        </mesh>
      </group>
      <group position={[0, 0.26, 0]} rotation={[0, 1.309, 0]}>
        <mesh position={[0, 0.588, 0.119]} rotation={[0.2, 0, 0]} castShadow>
          <cylinderGeometry args={[0.007, 0.02, 1.2, 6]} />
          <meshStandardMaterial color="#5f9080" roughness={0.85} flatShading />
        </mesh>
      </group>
      <group position={[0, 0.26, 0]} rotation={[0, 2.443, 0]}>
        <mesh position={[0, 0.544, 0.133]} rotation={[0.24, 0, 0]} castShadow>
          <cylinderGeometry args={[0.006, 0.019, 1.12, 6]} />
          <meshStandardMaterial color="#5f9080" roughness={0.85} flatShading />
        </mesh>
      </group>
      <group position={[0, 0.26, 0]} rotation={[0, 3.316, 0]}>
        <mesh position={[0, 0.571, 0.104]} rotation={[0.18, 0, 0]} castShadow>
          <cylinderGeometry args={[0.0065, 0.0195, 1.16, 6]} />
          <meshStandardMaterial color="#5f9080" roughness={0.85} flatShading />
        </mesh>
      </group>
      <group position={[0, 0.26, 0]} rotation={[0, 4.363, 0]}>
        <mesh position={[0, 0.507, 0.135]} rotation={[0.26, 0, 0]} castShadow>
          <cylinderGeometry args={[0.006, 0.018, 1.05, 6]} />
          <meshStandardMaterial color="#5f9080" roughness={0.85} flatShading />
        </mesh>
      </group>
      <group position={[0, 0.26, 0]} rotation={[0, 5.411, 0]}>
        <mesh position={[0, 0.543, 0.088]} rotation={[0.16, 0, 0]} castShadow>
          <cylinderGeometry args={[0.006, 0.0185, 1.1, 6]} />
          <meshStandardMaterial color="#5f9080" roughness={0.85} flatShading />
        </mesh>
      </group>
      <group position={[0, 0.26, 0]} rotation={[0, 0.785, 0]}>
        <mesh position={[0, 0.449, 0.022]} rotation={[0.05, 0, 0]} castShadow>
          <cylinderGeometry args={[0.005, 0.015, 0.9, 6]} />
          <meshStandardMaterial color="#5f9080" roughness={0.85} flatShading />
        </mesh>
      </group>
    </group>
  )
}

function PotatoPlant() {
  return (
    <group>
      {/* stems - bushy multi-stem clump (signature potato growth habit) */}
      <mesh position={[0, 0.63, 0]} castShadow>
        <cylinderGeometry args={[0.035, 0.06, 1.26, 6]} />
        <meshStandardMaterial color="#4a6b35" roughness={0.9} />
      </mesh>
      <mesh position={[0.15, 0.51, 0.08]} rotation={[0, 0, -0.22]} castShadow>
        <cylinderGeometry args={[0.028, 0.05, 1.02, 6]} />
        <meshStandardMaterial color="#4a6b35" roughness={0.9} />
      </mesh>
      <mesh position={[-0.16, 0.47, -0.07]} rotation={[0, 0, 0.25]} castShadow>
        <cylinderGeometry args={[0.026, 0.048, 0.94, 6]} />
        <meshStandardMaterial color="#4a6b35" roughness={0.9} />
      </mesh>
      <mesh position={[-0.09, 0.37, 0.16]} rotation={[0.18, 0, 0.1]} castShadow>
        <cylinderGeometry args={[0.022, 0.042, 0.74, 6]} />
        <meshStandardMaterial color="#4a6b35" roughness={0.9} />
      </mesh>
      <mesh position={[0.12, 0.35, -0.15]} rotation={[-0.15, 0, -0.12]} castShadow>
        <cylinderGeometry args={[0.02, 0.04, 0.7, 6]} />
        <meshStandardMaterial color="#4a6b35" roughness={0.9} />
      </mesh>

      {/* bushy compound-leaf foliage mounds */}
      <mesh position={[0, 1.38, 0]} castShadow>
        <icosahedronGeometry args={[0.33, 0]} />
        <meshStandardMaterial color="#4f7942" roughness={0.9} flatShading />
      </mesh>
      <mesh position={[0.25, 1.08, 0.09]} castShadow>
        <icosahedronGeometry args={[0.26, 0]} />
        <meshStandardMaterial color="#4f7942" roughness={0.9} flatShading />
      </mesh>
      <mesh position={[-0.26, 1.02, -0.08]} castShadow>
        <icosahedronGeometry args={[0.25, 0]} />
        <meshStandardMaterial color="#4f7942" roughness={0.9} flatShading />
      </mesh>
      <mesh position={[-0.13, 0.79, 0.21]} castShadow>
        <icosahedronGeometry args={[0.21, 0]} />
        <meshStandardMaterial color="#4f7942" roughness={0.9} flatShading />
      </mesh>
      <mesh position={[0.16, 0.74, -0.18]} castShadow>
        <icosahedronGeometry args={[0.2, 0]} />
        <meshStandardMaterial color="#4f7942" roughness={0.9} flatShading />
      </mesh>
      <mesh position={[0.07, 0.48, 0.24]} castShadow>
        <icosahedronGeometry args={[0.22, 0]} />
        <meshStandardMaterial color="#4f7942" roughness={0.9} flatShading />
      </mesh>
      <mesh position={[-0.08, 0.43, -0.23]} castShadow>
        <icosahedronGeometry args={[0.21, 0]} />
        <meshStandardMaterial color="#4f7942" roughness={0.9} flatShading />
      </mesh>

      {/* small star-shaped flowers (white + purple) with yellow anther centers */}
      <mesh position={[0.12, 1.56, 0.14]} rotation={[1.4, 0.3, 0]} castShadow>
        <coneGeometry args={[0.05, 0.025, 5]} />
        <meshStandardMaterial color="#f6f2ea" roughness={0.6} flatShading />
      </mesh>
      <mesh position={[0.12, 1.575, 0.155]} castShadow>
        <sphereGeometry args={[0.014, 6, 6]} />
        <meshStandardMaterial color="#f0b429" roughness={0.5} />
      </mesh>

      <mesh position={[-0.07, 1.54, 0.16]} rotation={[1.3, -0.4, 0.2]} castShadow>
        <coneGeometry args={[0.048, 0.024, 5]} />
        <meshStandardMaterial color="#9b6fc9" roughness={0.6} flatShading />
      </mesh>
      <mesh position={[-0.07, 1.555, 0.175]} castShadow>
        <sphereGeometry args={[0.013, 6, 6]} />
        <meshStandardMaterial color="#f0b429" roughness={0.5} />
      </mesh>

      <mesh position={[0.32, 1.26, 0.2]} rotation={[1.45, 0.5, -0.1]} castShadow>
        <coneGeometry args={[0.046, 0.023, 5]} />
        <meshStandardMaterial color="#f6f2ea" roughness={0.6} flatShading />
      </mesh>
      <mesh position={[0.335, 1.275, 0.215]} castShadow>
        <sphereGeometry args={[0.013, 6, 6]} />
        <meshStandardMaterial color="#f0b429" roughness={0.5} />
      </mesh>

      <mesh position={[0.36, 1.18, 0.06]} rotation={[1.35, 0.6, 0.1]} castShadow>
        <coneGeometry args={[0.045, 0.022, 5]} />
        <meshStandardMaterial color="#9b6fc9" roughness={0.6} flatShading />
      </mesh>
      <mesh position={[0.375, 1.195, 0.075]} castShadow>
        <sphereGeometry args={[0.012, 6, 6]} />
        <meshStandardMaterial color="#f0b429" roughness={0.5} />
      </mesh>
    </group>
  )
}

function BasilPlant() {
  return (
    <group>
      {/* main square-ish stem — basil (mint family) has a signature 4-sided stem */}
      <mesh position={[0, 0.26, 0]} castShadow>
        <cylinderGeometry args={[0.017, 0.03, 0.52, 4]} />
        <meshStandardMaterial color="#7a9a4a" roughness={0.9} />
      </mesh>

      {/* bushy side shoots from the base */}
      <mesh position={[0.1, 0.22, 0.04]} rotation={[0.15, 0, 0.65]} castShadow>
        <cylinderGeometry args={[0.01, 0.018, 0.34, 4]} />
        <meshStandardMaterial color="#7a9a4a" roughness={0.9} />
      </mesh>
      <mesh position={[-0.11, 0.2, -0.05]} rotation={[-0.12, 0, -0.68]} castShadow>
        <cylinderGeometry args={[0.01, 0.018, 0.32, 4]} />
        <meshStandardMaterial color="#7a9a4a" roughness={0.9} />
      </mesh>

      {/* lower leaf pair — largest, opposite along X */}
      <mesh position={[0.16, 0.16, 0]} rotation={[0, 0, 0.22]} scale={[1.7, 0.34, 1.05]} castShadow>
        <sphereGeometry args={[0.09, 7, 5]} />
        <meshStandardMaterial color="#4f9d33" roughness={0.85} flatShading />
      </mesh>
      <mesh position={[-0.16, 0.16, 0]} rotation={[0, 0, -0.22]} scale={[1.7, 0.34, 1.05]} castShadow>
        <sphereGeometry args={[0.09, 7, 5]} />
        <meshStandardMaterial color="#4f9d33" roughness={0.85} flatShading />
      </mesh>

      {/* mid leaf pair — rotated 90° from the pair below it (basil's decussate phyllotaxy), opposite along Z */}
      <mesh position={[0, 0.36, 0.15]} rotation={[-0.22, 0, 0]} scale={[1.05, 0.3, 1.5]} castShadow>
        <sphereGeometry args={[0.08, 7, 5]} />
        <meshStandardMaterial color="#6cbf3f" roughness={0.85} flatShading />
      </mesh>
      <mesh position={[0, 0.36, -0.15]} rotation={[0.22, 0, 0]} scale={[1.05, 0.3, 1.5]} castShadow>
        <sphereGeometry args={[0.08, 7, 5]} />
        <meshStandardMaterial color="#6cbf3f" roughness={0.85} flatShading />
      </mesh>

      {/* side-shoot leaf pairs fill out the bushy silhouette */}
      <mesh position={[0.24, 0.37, 0.08]} rotation={[0, 0, 0.4]} scale={[1.1, 0.28, 0.8]} castShadow>
        <sphereGeometry args={[0.065, 6, 5]} />
        <meshStandardMaterial color="#4f9d33" roughness={0.85} flatShading />
      </mesh>
      <mesh position={[0.19, 0.34, 0.13]} rotation={[0.35, 0, 0]} scale={[0.85, 0.26, 1]} castShadow>
        <sphereGeometry args={[0.06, 6, 5]} />
        <meshStandardMaterial color="#6cbf3f" roughness={0.85} flatShading />
      </mesh>
      <mesh position={[-0.25, 0.35, -0.09]} rotation={[0, 0, -0.4]} scale={[1.1, 0.28, 0.8]} castShadow>
        <sphereGeometry args={[0.065, 6, 5]} />
        <meshStandardMaterial color="#4f9d33" roughness={0.85} flatShading />
      </mesh>
      <mesh position={[-0.2, 0.32, -0.14]} rotation={[-0.35, 0, 0]} scale={[0.85, 0.26, 1]} castShadow>
        <sphereGeometry args={[0.06, 6, 5]} />
        <meshStandardMaterial color="#6cbf3f" roughness={0.85} flatShading />
      </mesh>

      {/* terminal flower spike — small white blossoms in a raceme, basil's signature bloom */}
      <mesh position={[0, 0.76, 0]} castShadow>
        <cylinderGeometry args={[0.006, 0.014, 0.48, 4]} />
        <meshStandardMaterial color="#87a457" roughness={0.8} />
      </mesh>
      <mesh position={[0.018, 0.6, 0.01]} castShadow>
        <sphereGeometry args={[0.028, 6, 6]} />
        <meshStandardMaterial color="#f7f7ec" roughness={0.55} />
      </mesh>
      <mesh position={[-0.02, 0.72, -0.015]} castShadow>
        <sphereGeometry args={[0.025, 6, 6]} />
        <meshStandardMaterial color="#f7f7ec" roughness={0.55} />
      </mesh>
      <mesh position={[0.017, 0.85, 0.018]} castShadow>
        <sphereGeometry args={[0.02, 6, 6]} />
        <meshStandardMaterial color="#f7f7ec" roughness={0.55} />
      </mesh>
      <mesh position={[0, 0.98, 0]} castShadow>
        <sphereGeometry args={[0.015, 6, 6]} />
        <meshStandardMaterial color="#f7f7ec" roughness={0.55} />
      </mesh>
    </group>
  )
}

function MarigoldPlant() {
  return (
    <group>
      {/* woody crown at soil level, where all stems emerge */}
      <mesh position={[0, 0.05, 0]} castShadow>
        <cylinderGeometry args={[0.05, 0.08, 0.1, 6]} />
        <meshStandardMaterial color="#5b4630" roughness={1} />
      </mesh>

      {/* dense mound of finely-divided, fern-like foliage */}
      <mesh position={[0, 0.32, 0]} castShadow>
        <icosahedronGeometry args={[0.3, 0]} />
        <meshStandardMaterial color="#2f6b32" roughness={0.9} flatShading />
      </mesh>
      <mesh position={[0.22, 0.27, 0.14]} castShadow>
        <icosahedronGeometry args={[0.25, 0]} />
        <meshStandardMaterial color="#2f6b32" roughness={0.9} flatShading />
      </mesh>
      <mesh position={[-0.21, 0.29, -0.13]} castShadow>
        <icosahedronGeometry args={[0.26, 0]} />
        <meshStandardMaterial color="#2f6b32" roughness={0.9} flatShading />
      </mesh>
      <mesh position={[0.03, 0.23, -0.24]} castShadow>
        <icosahedronGeometry args={[0.22, 0]} />
        <meshStandardMaterial color="#2f6b32" roughness={0.9} flatShading />
      </mesh>

      {/* thin stems lifting each bloom above the foliage mound */}
      <mesh position={[0.05, 0.58, 0.08]} castShadow>
        <cylinderGeometry args={[0.018, 0.025, 0.42, 5]} />
        <meshStandardMaterial color="#3f7d3f" roughness={0.9} />
      </mesh>
      <mesh position={[-0.2, 0.54, -0.15]} castShadow>
        <cylinderGeometry args={[0.018, 0.025, 0.38, 5]} />
        <meshStandardMaterial color="#3f7d3f" roughness={0.9} />
      </mesh>
      <mesh position={[0.18, 0.5, -0.22]} castShadow>
        <cylinderGeometry args={[0.018, 0.025, 0.32, 5]} />
        <meshStandardMaterial color="#3f7d3f" roughness={0.9} />
      </mesh>

      {/* dense double/crested pom-pom flower heads, gold + orange */}
      <mesh position={[0.06, 0.82, 0.11]} castShadow>
        <icosahedronGeometry args={[0.165, 0]} />
        <meshStandardMaterial color="#eaa221" roughness={0.7} flatShading />
      </mesh>
      <mesh position={[0.07, 0.85, 0.19]} castShadow>
        <icosahedronGeometry args={[0.09, 0]} />
        <meshStandardMaterial color="#f6c343" roughness={0.6} flatShading />
      </mesh>

      <mesh position={[-0.22, 0.76, -0.18]} castShadow>
        <icosahedronGeometry args={[0.15, 0]} />
        <meshStandardMaterial color="#f08c00" roughness={0.7} flatShading />
      </mesh>
      <mesh position={[-0.24, 0.79, -0.25]} castShadow>
        <icosahedronGeometry args={[0.082, 0]} />
        <meshStandardMaterial color="#f7b155" roughness={0.6} flatShading />
      </mesh>

      <mesh position={[0.2, 0.71, -0.25]} castShadow>
        <icosahedronGeometry args={[0.14, 0]} />
        <meshStandardMaterial color="#eaa221" roughness={0.7} flatShading />
      </mesh>
      <mesh position={[0.22, 0.74, -0.31]} castShadow>
        <icosahedronGeometry args={[0.076, 0]} />
        <meshStandardMaterial color="#f6c343" roughness={0.6} flatShading />
      </mesh>
    </group>
  )
}

function PeaPlant() {
  const h = 4.5
  const stemColor = '#7a9d5a'
  const leafColor = '#5f9450'
  const flowerColor = '#fdf8ec'
  const podColor = '#6aab3d'

  return (
    <group>
      {/* main climbing stem */}
      <mesh position={[0, h * 0.43, 0]} rotation={[0, 0, 0.05]} castShadow>
        <cylinderGeometry args={[0.022, 0.04, h * 0.86, 6]} />
        <meshStandardMaterial color={stemColor} roughness={0.85} />
      </mesh>

      {/* curling growth-tip tendril, a spiral of shrinking rings (signature feature) */}
      <group position={[0, h * 0.86, 0]}>
        <mesh position={[0.02, 0.03, 0]} rotation={[1.3, 0.2, 0]} castShadow>
          <torusGeometry args={[0.075, 0.011, 6, 10]} />
          <meshStandardMaterial color={stemColor} roughness={0.85} />
        </mesh>
        <mesh position={[0.05, 0.11, 0.015]} rotation={[1.3, 1.2, 0]} castShadow>
          <torusGeometry args={[0.05, 0.009, 6, 9]} />
          <meshStandardMaterial color={stemColor} roughness={0.85} />
        </mesh>
        <mesh position={[0.075, 0.19, 0.03]} rotation={[1.3, 2.1, 0]} castShadow>
          <torusGeometry args={[0.028, 0.007, 6, 8]} />
          <meshStandardMaterial color={stemColor} roughness={0.85} />
        </mesh>
      </group>

      {/* small coiled tendrils reaching out from leaf axils */}
      <mesh position={[0.17, h * 0.56, 0.05]} rotation={[1.4, 0.6, 0.3]} castShadow>
        <torusGeometry args={[0.05, 0.008, 6, 10]} />
        <meshStandardMaterial color={stemColor} roughness={0.85} />
      </mesh>
      <mesh position={[-0.16, h * 0.7, -0.04]} rotation={[1.4, -0.5, -0.3]} castShadow>
        <torusGeometry args={[0.045, 0.008, 6, 10]} />
        <meshStandardMaterial color={stemColor} roughness={0.85} />
      </mesh>

      {/* paired oval leaflets climbing the vine, node 1 */}
      <mesh position={[0.11, h * 0.28, 0.03]} rotation={[0.2, 0.4, 0.3]} scale={[1, 0.55, 0.4]} castShadow>
        <icosahedronGeometry args={[0.11, 0]} />
        <meshStandardMaterial color={leafColor} roughness={0.9} flatShading />
      </mesh>
      <mesh position={[-0.1, h * 0.28, -0.03]} rotation={[-0.2, -0.4, -0.3]} scale={[1, 0.55, 0.4]} castShadow>
        <icosahedronGeometry args={[0.1, 0]} />
        <meshStandardMaterial color={leafColor} roughness={0.9} flatShading />
      </mesh>

      {/* node 2 */}
      <mesh position={[-0.12, h * 0.44, 0.04]} rotation={[0.15, -0.3, -0.25]} scale={[1, 0.55, 0.4]} castShadow>
        <icosahedronGeometry args={[0.115, 0]} />
        <meshStandardMaterial color={leafColor} roughness={0.9} flatShading />
      </mesh>
      <mesh position={[0.1, h * 0.44, -0.04]} rotation={[-0.15, 0.3, 0.25]} scale={[1, 0.55, 0.4]} castShadow>
        <icosahedronGeometry args={[0.1, 0]} />
        <meshStandardMaterial color={leafColor} roughness={0.9} flatShading />
      </mesh>

      {/* node 3 */}
      <mesh position={[0.13, h * 0.6, 0.02]} rotation={[0.2, 0.5, 0.2]} scale={[1, 0.55, 0.4]} castShadow>
        <icosahedronGeometry args={[0.105, 0]} />
        <meshStandardMaterial color={leafColor} roughness={0.9} flatShading />
      </mesh>
      <mesh position={[-0.12, h * 0.6, -0.02]} rotation={[-0.2, -0.5, -0.2]} scale={[1, 0.55, 0.4]} castShadow>
        <icosahedronGeometry args={[0.1, 0]} />
        <meshStandardMaterial color={leafColor} roughness={0.9} flatShading />
      </mesh>

      {/* node 4, a single small unopened leaflet bud near the growing tip */}
      <mesh position={[0.08, h * 0.78, 0.03]} rotation={[0.2, 0.4, 0.2]} scale={[1, 0.55, 0.4]} castShadow>
        <icosahedronGeometry args={[0.07, 0]} />
        <meshStandardMaterial color={leafColor} roughness={0.9} flatShading />
      </mesh>

      {/* small white papilionaceous (butterfly-shaped) pea flowers */}
      <mesh position={[0.14, h * 0.5, 0.05]} rotation={[0, 0.3, 0]} scale={[1, 1.15, 0.4]} castShadow>
        <sphereGeometry args={[0.06, 8, 8]} />
        <meshStandardMaterial color={flowerColor} roughness={0.6} />
      </mesh>
      <mesh position={[0.14, h * 0.49, 0.08]} castShadow>
        <sphereGeometry args={[0.035, 8, 8]} />
        <meshStandardMaterial color={flowerColor} roughness={0.6} />
      </mesh>
      <mesh position={[-0.13, h * 0.66, -0.05]} rotation={[0, -0.3, 0]} scale={[1, 1.15, 0.4]} castShadow>
        <sphereGeometry args={[0.055, 8, 8]} />
        <meshStandardMaterial color={flowerColor} roughness={0.6} />
      </mesh>
      <mesh position={[-0.13, h * 0.65, -0.08]} castShadow>
        <sphereGeometry args={[0.032, 8, 8]} />
        <meshStandardMaterial color={flowerColor} roughness={0.6} />
      </mesh>

      {/* hanging green pea pods */}
      <mesh position={[0.14, h * 0.22, 0.05]} rotation={[0, 0, 2.5]} castShadow>
        <capsuleGeometry args={[0.026, 0.2, 4, 8]} />
        <meshStandardMaterial color={podColor} roughness={0.55} />
      </mesh>
      <mesh position={[0.19, h * 0.19, 0.07]} rotation={[0, 0, 2.75]} castShadow>
        <capsuleGeometry args={[0.024, 0.18, 4, 8]} />
        <meshStandardMaterial color={podColor} roughness={0.55} />
      </mesh>
      <mesh position={[-0.15, h * 0.33, -0.05]} rotation={[0, 0, -2.5]} castShadow>
        <capsuleGeometry args={[0.026, 0.2, 4, 8]} />
        <meshStandardMaterial color={podColor} roughness={0.55} />
      </mesh>
    </group>
  )
}

function RadishPlant() {
  return (
    <group>
      {/* thin taproot tip just touching the soil line */}
      <mesh position={[0, 0.045, 0]} rotation={[Math.PI, 0, 0]} castShadow>
        <coneGeometry args={[0.02, 0.09, 6]} />
        <meshStandardMaterial color="#e3c99c" roughness={0.9} />
      </mesh>

      {/* round crimson root, bulging mostly above the soil line */}
      <mesh position={[0, 0.14, 0]} scale={[1.05, 0.95, 1.05]} castShadow>
        <sphereGeometry args={[0.085, 10, 8]} />
        <meshStandardMaterial color="#c72c48" roughness={0.45} />
      </mesh>

      {/* pale shaded shoulder where the root meets the leaves */}
      <mesh position={[0, 0.205, 0]} scale={[1, 0.5, 1]} castShadow>
        <sphereGeometry args={[0.066, 10, 8]} />
        <meshStandardMaterial color="#eee6c9" roughness={0.6} />
      </mesh>

      {/* low rosette of lyrate leaves splayed outward from the crown */}
      <mesh position={[0.17, 0.33, 0]} rotation={[0, 0, 0.45]} scale={[2, 0.35, 1.05]} castShadow>
        <icosahedronGeometry args={[0.1, 0]} />
        <meshStandardMaterial color="#719d1c" roughness={0.85} flatShading />
      </mesh>
      <mesh position={[0.085, 0.32, 0.147]} rotation={[0, 1.0472, 0.55]} scale={[1.6, 0.35, 0.9]} castShadow>
        <icosahedronGeometry args={[0.1, 0]} />
        <meshStandardMaterial color="#719d1c" roughness={0.85} flatShading />
      </mesh>
      <mesh position={[-0.085, 0.33, 0.147]} rotation={[0, 2.0944, 0.45]} scale={[2, 0.35, 1.05]} castShadow>
        <icosahedronGeometry args={[0.1, 0]} />
        <meshStandardMaterial color="#719d1c" roughness={0.85} flatShading />
      </mesh>
      <mesh position={[-0.17, 0.32, 0]} rotation={[0, 3.1416, 0.55]} scale={[1.6, 0.35, 0.9]} castShadow>
        <icosahedronGeometry args={[0.1, 0]} />
        <meshStandardMaterial color="#719d1c" roughness={0.85} flatShading />
      </mesh>
      <mesh position={[-0.085, 0.33, -0.147]} rotation={[0, 4.1888, 0.45]} scale={[2, 0.35, 1.05]} castShadow>
        <icosahedronGeometry args={[0.1, 0]} />
        <meshStandardMaterial color="#719d1c" roughness={0.85} flatShading />
      </mesh>
      <mesh position={[0.085, 0.32, -0.147]} rotation={[0, 5.236, 0.55]} scale={[1.6, 0.35, 0.9]} castShadow>
        <icosahedronGeometry args={[0.1, 0]} />
        <meshStandardMaterial color="#719d1c" roughness={0.85} flatShading />
      </mesh>

      {/* young central bud leaf at the heart of the rosette */}
      <mesh position={[0, 0.5, 0]} scale={[0.9, 1.3, 0.9]} castShadow>
        <icosahedronGeometry args={[0.06, 0]} />
        <meshStandardMaterial color="#719d1c" roughness={0.85} flatShading />
      </mesh>
    </group>
  )
}

function PumpkinPlant() {
  return (
    <group>
      {/* crown / base stem hub */}
      <mesh position={[0, 0.13, 0]} rotation={[0, 0.3, 0]} castShadow>
        <cylinderGeometry args={[0.1, 0.14, 0.26, 6]} />
        <meshStandardMaterial color="#4d7a25" roughness={0.95} />
      </mesh>

      {/* sprawling vine arm 1 -> toward the fruit */}
      <mesh position={[0.59, 0.11, 0.29]} rotation={[0.04, -0.45, -1.55]} castShadow>
        <cylinderGeometry args={[0.065, 0.05, 1.3, 6]} />
        <meshStandardMaterial color="#4d7a25" roughness={0.9} />
      </mesh>
      <mesh position={[1.69, 0.09, 0.83]} rotation={[-0.03, -0.45, -1.55]} castShadow>
        <cylinderGeometry args={[0.05, 0.035, 1.15, 6]} />
        <meshStandardMaterial color="#4d7a25" roughness={0.9} />
      </mesh>

      {/* sprawling vine arm 2 -> back-left */}
      <mesh position={[-0.56, 0.11, -0.34]} rotation={[0.04, 2.6, -1.55]} castShadow>
        <cylinderGeometry args={[0.065, 0.05, 1.3, 6]} />
        <meshStandardMaterial color="#4d7a25" roughness={0.9} />
      </mesh>
      <mesh position={[-1.6, 0.08, -0.97]} rotation={[-0.03, 2.6, -1.55]} castShadow>
        <cylinderGeometry args={[0.05, 0.035, 1.1, 6]} />
        <meshStandardMaterial color="#4d7a25" roughness={0.9} />
      </mesh>

      {/* sprawling vine arm 3 -> front-left */}
      <mesh position={[-0.36, 0.11, 0.49]} rotation={[0.04, -2.2, -1.55]} castShadow>
        <cylinderGeometry args={[0.06, 0.045, 1.2, 6]} />
        <meshStandardMaterial color="#4d7a25" roughness={0.9} />
      </mesh>
      <mesh position={[-1.02, 0.08, 1.4]} rotation={[-0.03, -2.2, -1.55]} castShadow>
        <cylinderGeometry args={[0.045, 0.032, 1.05, 6]} />
        <meshStandardMaterial color="#4d7a25" roughness={0.9} />
      </mesh>

      {/* central leaf cluster 1 -- long, mostly-upright petiole lifts this blade to the
          plant's peak (~1.2ft), fixing the previous flat, low-canopy silhouette */}
      <group position={[0.18, 0.16, 0.1]} rotation={[0, 0.45, 0]}>
        <mesh position={[0, 0.395, 0.088]} rotation={[0.22, 0, 0]} castShadow>
          <cylinderGeometry args={[0.032, 0.045, 0.81, 5]} />
          <meshStandardMaterial color="#5c8a34" roughness={0.9} />
        </mesh>
        <mesh position={[0, 0.84, 0.257]} rotation={[0.08, 0.4, -0.05]} scale={[1.15, 0.42, 1.05]} castShadow>
          <icosahedronGeometry args={[0.44, 0]} />
          <meshStandardMaterial color="#2f6b1f" roughness={0.9} flatShading />
        </mesh>
      </group>

      {/* central leaf cluster 2 -- second tall upright leaf, opposite side of the crown */}
      <group position={[-0.22, 0.16, -0.12]} rotation={[0, -2.4, 0]}>
        <mesh position={[0, 0.359, 0.088]} rotation={[0.24, 0, 0]} castShadow>
          <cylinderGeometry args={[0.03, 0.042, 0.74, 5]} />
          <meshStandardMaterial color="#5c8a34" roughness={0.9} />
        </mesh>
        <mesh position={[0, 0.769, 0.256]} rotation={[-0.05, -0.35, 0.08]} scale={[1.1, 0.4, 1]} castShadow>
          <icosahedronGeometry args={[0.41, 0]} />
          <meshStandardMaterial color="#3d7a28" roughness={0.9} flatShading />
        </mesh>
      </group>

      {/* vine-tip leaf riding arm 1 out toward the fruit */}
      <group position={[1.35, 0.14, 0.68]} rotation={[0, 0.9, 0]}>
        <mesh position={[0, 0.344, 0.106]} rotation={[0.3, 0, 0]} castShadow>
          <cylinderGeometry args={[0.032, 0.045, 0.72, 5]} />
          <meshStandardMaterial color="#5c8a34" roughness={0.9} />
        </mesh>
        <mesh position={[0, 0.738, 0.293]} rotation={[0.1, 0.55, -0.05]} scale={[1.25, 0.39, 1.1]} castShadow>
          <icosahedronGeometry args={[0.44, 0]} />
          <meshStandardMaterial color="#2f6b1f" roughness={0.9} flatShading />
        </mesh>
      </group>

      {/* vine-tip leaf riding arm 2 out to the back-left */}
      <group position={[-1.6, 0.13, -0.98]} rotation={[0, -0.6, 0]}>
        <mesh position={[0, 0.304, 0.101]} rotation={[0.32, 0, 0]} castShadow>
          <cylinderGeometry args={[0.028, 0.04, 0.64, 5]} />
          <meshStandardMaterial color="#5c8a34" roughness={0.9} />
        </mesh>
        <mesh position={[0, 0.658, 0.281]} rotation={[0.05, 0.25, 0.08]} scale={[1.1, 0.36, 1]} castShadow>
          <icosahedronGeometry args={[0.38, 0]} />
          <meshStandardMaterial color="#2f6b1f" roughness={0.9} flatShading />
        </mesh>
      </group>

      {/* vine-tip leaf riding arm 3 out to the front-left */}
      <group position={[-1.03, 0.13, 1.45]} rotation={[0, 2.6, 0]}>
        <mesh position={[0, 0.296, 0.092]} rotation={[0.3, 0, 0]} castShadow>
          <cylinderGeometry args={[0.028, 0.04, 0.62, 5]} />
          <meshStandardMaterial color="#5c8a34" roughness={0.9} />
        </mesh>
        <mesh position={[0, 0.642, 0.263]} rotation={[-0.05, -0.25, -0.08]} scale={[1.1, 0.36, 1]} castShadow>
          <icosahedronGeometry args={[0.37, 0]} />
          <meshStandardMaterial color="#3d7a28" roughness={0.9} flatShading />
        </mesh>
      </group>

      {/* curling tendrils */}
      <mesh position={[0.75, 0.24, 0.42]} rotation={[1.3, 0.4, 0.2]} castShadow>
        <torusGeometry args={[0.06, 0.014, 6, 10]} />
        <meshStandardMaterial color="#6b9c3f" roughness={0.85} />
      </mesh>
      <mesh position={[-0.65, 0.22, -0.55]} rotation={[0.9, 1.0, 0.3]} castShadow>
        <torusGeometry args={[0.055, 0.013, 6, 10]} />
        <meshStandardMaterial color="#6b9c3f" roughness={0.85} />
      </mesh>

      {/* bright yellow-orange trumpet flowers */}
      <mesh position={[0.95, 0.5, 0.5]} rotation={[3.0, 0.3, 0]} castShadow>
        <coneGeometry args={[0.1, 0.18, 7]} />
        <meshStandardMaterial color="#f6a800" roughness={0.6} />
      </mesh>
      <mesh position={[-0.85, 0.46, 1.05]} rotation={[2.85, -0.3, 0.2]} castShadow>
        <coneGeometry args={[0.09, 0.16, 7]} />
        <meshStandardMaterial color="#f6a800" roughness={0.6} />
      </mesh>

      {/* the big round pumpkin resting on the ground */}
      <mesh position={[1.45, 0.41, 0.8]} scale={[1, 0.82, 1]} castShadow>
        <sphereGeometry args={[0.5, 14, 12]} />
        <meshStandardMaterial color="#e8590c" roughness={0.55} />
      </mesh>
      <mesh position={[1.45, 0.8, 0.8]} rotation={[0.1, 0, 0.15]} castShadow>
        <cylinderGeometry args={[0.05, 0.08, 0.22, 6]} />
        <meshStandardMaterial color="#7c5c34" roughness={1} />
      </mesh>
    </group>
  )
}

export const PLANT_MODELS = {
  corn: CornPlant,
  strawberry: StrawberryPlant,
  cucumber: CucumberPlant,
  zucchini: ZucchiniPlant,
  kale: KalePlant,
  cabbage: CabbagePlant,
  broccoli: BroccoliPlant,
  onion: OnionPlant,
  potato: PotatoPlant,
  basil: BasilPlant,
  marigold: MarigoldPlant,
  pea: PeaPlant,
  radish: RadishPlant,
  pumpkin: PumpkinPlant,
}
