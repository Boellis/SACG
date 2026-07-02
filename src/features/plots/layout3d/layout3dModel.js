// layout3dModel.js
// 3D-native data model + helpers for the immersive Plot Layout tool.
// World units = FEET (1 world unit === 1 foot).
//
// Saved layout:
// { version: 3, plot: { widthFt, depthFt, half }, shapes: Shape3D[] }
//
// Shape3D = {
//   id, kind: 'bed' | 'path' | 'feature',
//   variant?: 'barrel' | 'stake' | 'trellis',   // features only
//   pos:  [x, z],       // feet, origin = plot center
//   size: [w, d, h],    // feet
//   rotationY,          // radians
//   color, label,
//   crops: Crop3D[]     // beds only
// }
//
// Crop3D = { id, type, pos: [x, z] }   // pos is LOCAL to the bed (feet, origin = bed center)

export const LAYOUT_VERSION = 3

export function makeId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return 'id-' + Math.random().toString(36).slice(2, 10)
}

// ---- crop catalog --------------------------------------------------------
// height in feet. foliage/fruit = procedural plant colors.
// head  = big flower head at top (sunflower/flower). ground = large fruit on the soil (watermelon/squash).
export const CROP_TYPES = {
  tomato:     { label: 'Tomato',     emoji: '🍅', foliage: '#2f9e44', height: 1.6, fruit: '#e03131' },
  eggplant:   { label: 'Eggplant',   emoji: '🍆', foliage: '#37b24d', height: 1.2, fruit: '#7048e8' },
  pepper:     { label: 'Pepper',     emoji: '🫑', foliage: '#2f9e44', height: 1.1, fruit: '#40c057' },
  beans:      { label: 'Beans',      emoji: '🫘', foliage: '#40c057', height: 4.0, fruit: '#2b8a3e' },
  sunflower:  { label: 'Sunflower',  emoji: '🌻', foliage: '#2f9e44', height: 5.0, head: '#f5b400' },
  watermelon: { label: 'Watermelon', emoji: '🍉', foliage: '#37b24d', height: 0.5, ground: '#2f9e44' },
  squash:     { label: 'Squash',     emoji: '🎃', foliage: '#37b24d', height: 0.8, ground: '#f08c00' },
  lettuce:    { label: 'Lettuce',    emoji: '🥬', foliage: '#82c91e', height: 0.5 },
  carrot:     { label: 'Carrot',     emoji: '🥕', foliage: '#66a80f', height: 0.6 },
  herb:       { label: 'Herb',       emoji: '🌿', foliage: '#40c057', height: 0.7 },
  flower:     { label: 'Flower',     emoji: '🌼', foliage: '#51cf66', height: 0.8, head: '#fcc419' },
}
export const CROP_KEYS = Object.keys(CROP_TYPES)

// ---- shape defaults (feet) ----------------------------------------------
export const DEFAULTS = {
  bed:  { size: [4, 2, 0.75], color: '#4d7c0f', label: 'Bed' },
  path: { size: [2, 6, 0.1],  color: '#b08968', label: 'Path' },
}

// feature variants get their own model in GardenShape3D
export const FEATURE_TYPES = {
  barrel:  { label: 'Water Barrel', size: [1.5, 1.5, 2], color: '#3b82f6' },
  stake:   { label: 'Tomato Stake', size: [0.2, 0.2, 5], color: '#7f9a5f' },
  trellis: { label: 'Trellis',      size: [4, 0.3, 5],   color: '#a1866f' },
}
export const FEATURE_KEYS = Object.keys(FEATURE_TYPES)

export function effectivePlot(widthFt, depthFt, half) {
  return { w: widthFt, d: half ? depthFt / 2 : depthFt }
}

// ---- factories -----------------------------------------------------------
export function makeShape(kind, pos = [0, 0], variant) {
  if (kind === 'feature') {
    const v = variant && FEATURE_TYPES[variant] ? variant : 'barrel'
    const f = FEATURE_TYPES[v]
    return { id: makeId(), kind: 'feature', variant: v, pos, size: [...f.size], rotationY: 0, color: f.color, label: f.label, crops: [] }
  }
  const d = DEFAULTS[kind] || DEFAULTS.bed
  return { id: makeId(), kind, pos, size: [...d.size], rotationY: 0, color: d.color, label: d.label, crops: [] }
}

export function makeCrop(type = 'tomato', pos = [0, 0]) {
  return { id: makeId(), type, pos }
}

// ---- (de)serialization ---------------------------------------------------
export function serializeLayout(shapes, plot) {
  return { version: LAYOUT_VERSION, plot, shapes }
}

export function deserializeLayout(layout) {
  if (!layout || !Array.isArray(layout.shapes)) return []
  return layout.shapes.map((s) => ({
    id: s.id || makeId(),
    kind: s.kind === 'path' || s.kind === 'feature' ? s.kind : 'bed',
    variant: s.kind === 'feature' ? (FEATURE_TYPES[s.variant] ? s.variant : 'barrel') : undefined,
    pos: Array.isArray(s.pos) ? [s.pos[0] || 0, s.pos[1] || 0] : [0, 0],
    size: Array.isArray(s.size) ? [s.size[0] || 1, s.size[1] || 1, s.size[2] || 0.5] : [4, 2, 0.75],
    rotationY: typeof s.rotationY === 'number' ? s.rotationY : 0,
    color: s.color || '#4d7c0f',
    label: s.label || '',
    crops: Array.isArray(s.crops)
      ? s.crops.map((c) => ({
          id: c.id || makeId(),
          type: c.type || 'tomato',
          pos: Array.isArray(c.pos) ? [c.pos[0] || 0, c.pos[1] || 0] : [0, 0],
        }))
      : [],
  }))
}

// Grid positions (local, feet, origin = bed center) — used only for INITIAL placement
// of a newly added crop; after that each crop carries its own draggable pos.
export function cropGrid(count, w, d) {
  if (count <= 0) return []
  const cols = Math.max(1, Math.ceil(Math.sqrt(count * (w / d))))
  const rows = Math.ceil(count / cols)
  const out = []
  const mx = w / cols
  const mz = d / rows
  let i = 0
  for (let r = 0; r < rows && i < count; r++) {
    for (let c = 0; c < cols && i < count; c++, i++) {
      out.push([-w / 2 + mx * (c + 0.5), -d / 2 + mz * (r + 0.5)])
    }
  }
  return out
}
