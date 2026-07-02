// Plant3D.jsx
// Dispatches to a per-crop procedural model (PLANT_MODELS), falling back to the
// generic parametric plant, and adds the optional hover label.
import { Billboard, Text } from '@react-three/drei'
import { CROP_TYPES } from './layout3dModel'
import { PLANT_MODELS, GenericPlant } from './plantModels'

export default function Plant3D({ type, showLabel = false }) {
  const spec = CROP_TYPES[type] || CROP_TYPES.tomato
  const Model = PLANT_MODELS[type] || GenericPlant
  const h = spec.height

  return (
    <group>
      <Model spec={spec} />

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
