// structures.jsx
// Procedural 3D models for garden structures (arch trellis, obelisk, arbor, cold
// frame). GardenShape3D renders STRUCTURE_MODELS[variant] for a feature shape.
// Each is a self-contained function returning a <group> modeled in feet, base at y=0.

function ArchTrellisStructure() {
  const postX = 2.15
  const postH = 5.35
  const woodPost = '#9c6b3e'
  const woodLattice = '#b98a52'
  const capColor = '#3f3226'
  const leafColor = '#2f9e44'

  const rungs = [
    { p: [1.74, 6.24, 0], rz: 0.47 },
    { p: [0.89, 7.09, 0], rz: 1.1 },
    { p: [0, 7.3, 0], rz: Math.PI / 2 },
    { p: [-0.89, 7.09, 0], rz: 2.04 },
    { p: [-1.74, 6.24, 0], rz: 2.67 },
  ]

  const foliage = [
    [-2.15, 1.3, 0.16, 0.22],
    [-2.22, 2.6, 0.14, 0.24],
    [2.15, 1.1, 0.15, 0.2],
    [-1.3, 6.6, 0.12, 0.2],
    [0.3, 7.35, 0.1, 0.18],
  ]

  const flowers = [
    [-2.1, 2.9, 0.3, 0.06, '#e64980'],
    [-1.2, 6.65, 0.28, 0.055, '#7048e8'],
  ]

  return (
    <group>
      {/* side posts: tapered post + base flare + ground sled foot */}
      {[-postX, postX].map((x, i) => (
        <group key={'post' + i}>
          <mesh position={[x, postH / 2, 0]} castShadow>
            <cylinderGeometry args={[0.12, 0.16, postH, 6]} />
            <meshStandardMaterial color={woodPost} roughness={0.9} />
          </mesh>
          <mesh position={[x, 0.14, 0]} castShadow>
            <cylinderGeometry args={[0.2, 0.22, 0.28, 6]} />
            <meshStandardMaterial color={woodPost} roughness={0.9} />
          </mesh>
          <mesh position={[x, 0.06, 0]} castShadow>
            <boxGeometry args={[0.16, 0.12, 1.05]} />
            <meshStandardMaterial color={woodPost} roughness={0.9} />
          </mesh>
        </group>
      ))}

      {/* curved arched top: outer beam + inner trim rail */}
      <mesh position={[0, postH, 0]} castShadow>
        <torusGeometry args={[postX, 0.14, 6, 24, Math.PI]} />
        <meshStandardMaterial color={woodPost} roughness={0.85} />
      </mesh>
      <mesh position={[0, postH, 0]} castShadow>
        <torusGeometry args={[postX - 0.4, 0.06, 5, 16, Math.PI]} />
        <meshStandardMaterial color={woodLattice} roughness={0.85} />
      </mesh>

      {/* radial lattice rungs fanning under the arch, for climbers to grip */}
      {rungs.map((r, i) => (
        <mesh key={'rung' + i} position={r.p} rotation={[0, 0, r.rz]} castShadow>
          <boxGeometry args={[0.42, 0.05, 0.09]} />
          <meshStandardMaterial color={woodLattice} roughness={0.85} />
        </mesh>
      ))}

      {/* peak finial */}
      <mesh position={[0, 7.68, 0]} castShadow>
        <sphereGeometry args={[0.12, 8, 8]} />
        <meshStandardMaterial color={capColor} roughness={0.4} />
      </mesh>

      {/* climbing vine foliage across the base and over the arch */}
      {foliage.map((b, i) => (
        <mesh key={'leaf' + i} position={[b[0], b[1], b[2]]} castShadow>
          <icosahedronGeometry args={[b[3], 0]} />
          <meshStandardMaterial color={leafColor} roughness={0.9} flatShading />
        </mesh>
      ))}

      {/* vine flowers */}
      {flowers.map((f, i) => (
        <mesh key={'flower' + i} position={[f[0], f[1], f[2]]} castShadow>
          <sphereGeometry args={[f[3], 8, 8]} />
          <meshStandardMaterial color={f[4]} roughness={0.5} />
        </mesh>
      ))}
    </group>
  )
}

function ObeliskStructure() {
  // overall height incl. finial = 6ft; base footprint = ~2ft square
  const baseHalf = 1     // ft — half of the square base

  const apexY = 5.3      // ft — height where the 4 legs converge
  const d = baseHalf * Math.SQRT2
  const legLen = Math.sqrt(d * d + apexY * apexY)
  const tilt = Math.atan2(d, apexY)

  const woodColor = '#6b4226'
  const ironColor = '#3a332c'
  const brassColor = '#a9812f'

  const ringHeights = [0.15, 1.3, 2.6, 3.9]

  return (
    <group>
      {/* 4 tapered corner legs, leaning inward to meet above the center */}
      {[0, 1, 2, 3].map((i) => (
        <group key={i} rotation={[0, Math.PI / 4 + (i * Math.PI) / 2, 0]}>
          <mesh position={[d / 2, apexY / 2, 0]} rotation={[0, 0, tilt]} castShadow>
            <cylinderGeometry args={[0.02, 0.055, legLen, 6]} />
            <meshStandardMaterial color={woodColor} roughness={0.85} />
          </mesh>
        </group>
      ))}

      {/* horizontal rings binding the 4 legs, shrinking with the taper */}
      {ringHeights.map((y, i) => (
        <mesh key={i} position={[0, y, 0]} rotation={[-Math.PI / 2, 0, 0]} castShadow>
          <torusGeometry args={[baseHalf * (1 - y / apexY) * Math.SQRT2, 0.025, 6, 12]} />
          <meshStandardMaterial color={ironColor} roughness={0.6} />
        </mesh>
      ))}

      {/* decorative collar where the legs converge */}
      <mesh position={[0, apexY, 0]} rotation={[-Math.PI / 2, 0, 0]} castShadow>
        <torusGeometry args={[0.09, 0.032, 6, 12]} />
        <meshStandardMaterial color={ironColor} roughness={0.6} />
      </mesh>

      {/* finial: spike + ball */}
      <mesh position={[0, apexY + 0.21, 0]} castShadow>
        <coneGeometry args={[0.075, 0.42, 6]} />
        <meshStandardMaterial color={brassColor} roughness={0.45} />
      </mesh>
      <mesh position={[0, apexY + 0.42 + 0.14, 0]} castShadow>
        <sphereGeometry args={[0.14, 10, 10]} />
        <meshStandardMaterial color={brassColor} roughness={0.4} />
      </mesh>
    </group>
  )
}

function ArborStructure() {
  const postH = 6.3
  const postSize = 0.35
  const postX = 2.7
  const postZ = 2.7
  const headerH = 0.4
  const headerT = 0.18
  const headerLen = 7.0
  const rafterH = 0.3
  const rafterT = 0.15
  const rafterLen = 7.0
  const woodPost = '#a1665b'
  const woodBeam = '#8a5642'
  const stone = '#8d8a82'
  const leaf = '#5a8f3c'

  const corners = [
    [postX, postZ],
    [postX, -postZ],
    [-postX, postZ],
    [-postX, -postZ],
  ]

  const rafterZ = [-2.7, -1.35, 0, 1.35, 2.7]

  return (
    <group>
      {/* concrete post footings */}
      {corners.map(([x, z], i) => (
        <mesh key={'f' + i} position={[x, 0.07, z]} castShadow receiveShadow>
          <boxGeometry args={[0.5, 0.14, 0.5]} />
          <meshStandardMaterial color={stone} roughness={0.95} />
        </mesh>
      ))}

      {/* four posts */}
      {corners.map(([x, z], i) => (
        <mesh key={'p' + i} position={[x, postH / 2, z]} castShadow>
          <boxGeometry args={[postSize, postH, postSize]} />
          <meshStandardMaterial color={woodPost} roughness={0.85} />
        </mesh>
      ))}

      {/* diagonal knee braces under the header beams */}
      {corners.map(([x, z], i) => {
        const s = z >= 0 ? 1 : -1
        return (
          <mesh
            key={'b' + i}
            position={[x, postH - 0.25, z - s * 0.3]}
            rotation={[-s * 0.88, 0, 0]}
            castShadow
          >
            <boxGeometry args={[0.09, 0.8, 0.09]} />
            <meshStandardMaterial color={woodBeam} roughness={0.85} />
          </mesh>
        )
      })}

      {/* two header beams running depth-wise, resting directly on the posts */}
      <mesh position={[postX, postH + headerH / 2, 0]} castShadow>
        <boxGeometry args={[headerT, headerH, headerLen]} />
        <meshStandardMaterial color={woodBeam} roughness={0.85} />
      </mesh>
      <mesh position={[-postX, postH + headerH / 2, 0]} castShadow>
        <boxGeometry args={[headerT, headerH, headerLen]} />
        <meshStandardMaterial color={woodBeam} roughness={0.85} />
      </mesh>

      {/* rafters running width-wise, crossed over the headers to form the slatted flat roof */}
      {rafterZ.map((z, i) => (
        <mesh key={'r' + i} position={[0, postH + headerH + rafterH / 2, z]} castShadow>
          <boxGeometry args={[rafterLen, rafterH, rafterT]} />
          <meshStandardMaterial color={woodPost} roughness={0.85} />
        </mesh>
      ))}

      {/* climbing vine foliage up one post and draping onto the roof */}
      <mesh position={[-2.62, 1.0, -2.78]} castShadow>
        <icosahedronGeometry args={[0.16, 0]} />
        <meshStandardMaterial color={leaf} roughness={0.9} flatShading />
      </mesh>
      <mesh position={[-2.78, 2.3, -2.6]} castShadow>
        <icosahedronGeometry args={[0.2, 0]} />
        <meshStandardMaterial color={leaf} roughness={0.9} flatShading />
      </mesh>
      <mesh position={[-2.6, 3.7, -2.75]} castShadow>
        <icosahedronGeometry args={[0.19, 0]} />
        <meshStandardMaterial color={leaf} roughness={0.9} flatShading />
      </mesh>
      <mesh position={[-2.75, 5.2, -2.6]} castShadow>
        <icosahedronGeometry args={[0.22, 0]} />
        <meshStandardMaterial color={leaf} roughness={0.9} flatShading />
      </mesh>
      <mesh position={[-1.9, 7.05, -2.1]} castShadow>
        <icosahedronGeometry args={[0.2, 0]} />
        <meshStandardMaterial color={leaf} roughness={0.9} flatShading />
      </mesh>
    </group>
  )
}

function ColdFrameStructure() {
  return (
    <group>
      {/* back wall - tall side, braces against wind */}
      <mesh position={[0, 0.7, -1.06]} castShadow>
        <boxGeometry args={[3, 1.4, 0.08]} />
        <meshStandardMaterial color="#9c7a4d" roughness={0.85} />
      </mesh>

      {/* front wall - short side, angled toward the sun */}
      <mesh position={[0, 0.425, 1.06]} castShadow>
        <boxGeometry args={[3, 0.85, 0.08]} />
        <meshStandardMaterial color="#9c7a4d" roughness={0.85} />
      </mesh>

      {/* left side wall, stepped in two panels to approximate the sloped top */}
      <mesh position={[-1.46, 0.575, -0.55]} castShadow>
        <boxGeometry args={[0.08, 1.15, 1.1]} />
        <meshStandardMaterial color="#9c7a4d" roughness={0.85} />
      </mesh>
      <mesh position={[-1.46, 0.45, 0.55]} castShadow>
        <boxGeometry args={[0.08, 0.9, 1.1]} />
        <meshStandardMaterial color="#9c7a4d" roughness={0.85} />
      </mesh>

      {/* right side wall, stepped in two panels to approximate the sloped top */}
      <mesh position={[1.46, 0.575, -0.55]} castShadow>
        <boxGeometry args={[0.08, 1.15, 1.1]} />
        <meshStandardMaterial color="#9c7a4d" roughness={0.85} />
      </mesh>
      <mesh position={[1.46, 0.45, 0.55]} castShadow>
        <boxGeometry args={[0.08, 0.9, 1.1]} />
        <meshStandardMaterial color="#9c7a4d" roughness={0.85} />
      </mesh>

      {/* corner posts */}
      <mesh position={[-1.5, 0.7, -1.1]} castShadow>
        <boxGeometry args={[0.1, 1.4, 0.1]} />
        <meshStandardMaterial color="#7a5c3a" roughness={0.9} />
      </mesh>
      <mesh position={[1.5, 0.7, -1.1]} castShadow>
        <boxGeometry args={[0.1, 1.4, 0.1]} />
        <meshStandardMaterial color="#7a5c3a" roughness={0.9} />
      </mesh>
      <mesh position={[-1.5, 0.425, 1.1]} castShadow>
        <boxGeometry args={[0.1, 0.85, 0.1]} />
        <meshStandardMaterial color="#7a5c3a" roughness={0.9} />
      </mesh>
      <mesh position={[1.5, 0.425, 1.1]} castShadow>
        <boxGeometry args={[0.1, 0.85, 0.1]} />
        <meshStandardMaterial color="#7a5c3a" roughness={0.9} />
      </mesh>

      {/* bare soil visible through the bottomless frame */}
      <mesh position={[0, 0.02, 0]} rotation={[-1.5708, 0, 0]} receiveShadow>
        <planeGeometry args={[2.6, 1.9]} />
        <meshStandardMaterial color="#4a2f1c" roughness={1} />
      </mesh>

      {/* slanted sash lid: tall at back, low at front to catch the sun */}
      <group position={[0, 1.15, 0]} rotation={[0.25, 0, 0]}>
        <mesh castShadow>
          <boxGeometry args={[3.3, 0.07, 2.5]} />
          <meshStandardMaterial color="#e8e4d6" roughness={0.6} />
        </mesh>
        <mesh position={[0, 0.04, 0]} castShadow>
          <boxGeometry args={[0.09, 0.08, 2.5]} />
          <meshStandardMaterial color="#e8e4d6" roughness={0.6} />
        </mesh>
        <mesh position={[0, 0.04, 0]} castShadow>
          <boxGeometry args={[3.3, 0.08, 0.09]} />
          <meshStandardMaterial color="#e8e4d6" roughness={0.6} />
        </mesh>
        <mesh position={[-0.775, 0.025, -0.575]}>
          <boxGeometry args={[1.45, 0.035, 1.05]} />
          <meshStandardMaterial color="#a9d6de" roughness={0.15} transparent opacity={0.4} />
        </mesh>
        <mesh position={[0.775, 0.025, -0.575]}>
          <boxGeometry args={[1.45, 0.035, 1.05]} />
          <meshStandardMaterial color="#a9d6de" roughness={0.15} transparent opacity={0.4} />
        </mesh>
        <mesh position={[-0.775, 0.025, 0.575]}>
          <boxGeometry args={[1.45, 0.035, 1.05]} />
          <meshStandardMaterial color="#a9d6de" roughness={0.15} transparent opacity={0.4} />
        </mesh>
        <mesh position={[0.775, 0.025, 0.575]}>
          <boxGeometry args={[1.45, 0.035, 1.05]} />
          <meshStandardMaterial color="#a9d6de" roughness={0.15} transparent opacity={0.4} />
        </mesh>
      </group>
    </group>
  )
}

export const STRUCTURE_MODELS = {
  archTrellis: ArchTrellisStructure,
  obelisk: ObeliskStructure,
  arbor: ArborStructure,
  coldFrame: ColdFrameStructure,
}
