import { useRef, useState } from 'react';
import { Button } from '../../components/ui';
import { useAuth } from '../../auth/useAuth';
import { setPlotLayout } from './plotsApi';
import type { Plot, PlotShape, PlotShapeType } from '../../lib/types';

interface Props {
  plot: Plot;
}

const VIEW_W = 400;
const VIEW_H = 300;
const DEFAULT_W = 80;
const DEFAULT_H = 60;

// Garden-palette-friendly preset swatches.
const PRESET_COLORS = ['#4d7c0f', '#65a30d', '#0e7490', '#b45309', '#9333ea', '#dc2626'];

function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function makeShape(type: PlotShapeType): PlotShape {
  return {
    id: newId(),
    type,
    x: (VIEW_W - DEFAULT_W) / 2,
    y: (VIEW_H - DEFAULT_H) / 2,
    w: DEFAULT_W,
    h: DEFAULT_H,
    color: PRESET_COLORS[0],
    label: '',
  };
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

/** Render a single shape's geometry by type. */
function ShapeGraphic({ shape }: { shape: PlotShape }) {
  const fillOpacity = 0.55;
  if (shape.type === 'circle') {
    return (
      <ellipse
        cx={shape.x + shape.w / 2}
        cy={shape.y + shape.h / 2}
        rx={shape.w / 2}
        ry={shape.h / 2}
        fill={shape.color}
        fillOpacity={fillOpacity}
      />
    );
  }
  if (shape.type === 'triangle') {
    const top = `${shape.x + shape.w / 2},${shape.y}`;
    const bottomLeft = `${shape.x},${shape.y + shape.h}`;
    const bottomRight = `${shape.x + shape.w},${shape.y + shape.h}`;
    return (
      <polygon points={`${top} ${bottomLeft} ${bottomRight}`} fill={shape.color} fillOpacity={fillOpacity} />
    );
  }
  // rect (square is just equal w/h)
  return (
    <rect
      x={shape.x}
      y={shape.y}
      width={shape.w}
      height={shape.h}
      rx={4}
      fill={shape.color}
      fillOpacity={fillOpacity}
    />
  );
}

export default function PlotLayoutEditor({ plot }: Props) {
  const { member, role } = useAuth();
  const editable = role === 'admin' || plot.holderMemberId === member?.id;

  const [shapes, setShapes] = useState<PlotShape[]>(plot.layout?.shapes ?? []);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState('');

  const svgRef = useRef<SVGSVGElement | null>(null);
  // Offset between pointer and shape origin at drag start, in SVG units.
  const dragOffset = useRef<{ dx: number; dy: number } | null>(null);

  const selected = shapes.find((s) => s.id === selectedId) ?? null;

  /** Convert a client (screen) point into SVG viewBox coordinates. */
  function toSvgPoint(clientX: number, clientY: number): { x: number; y: number } {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const rect = svg.getBoundingClientRect();
    // Guard against zero-size (jsdom) to avoid NaN.
    const scaleX = rect.width ? VIEW_W / rect.width : 1;
    const scaleY = rect.height ? VIEW_H / rect.height : 1;
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY,
    };
  }

  function addShape(type: PlotShapeType) {
    const shape = makeShape(type);
    setShapes((prev) => [...prev, shape]);
    setSelectedId(shape.id);
    setSaved(false);
  }

  function updateSelected(patch: Partial<PlotShape>) {
    if (!selectedId) return;
    setShapes((prev) => prev.map((s) => (s.id === selectedId ? { ...s, ...patch } : s)));
    setSaved(false);
  }

  function deleteSelected() {
    if (!selectedId) return;
    setShapes((prev) => prev.filter((s) => s.id !== selectedId));
    setSelectedId(null);
    setSaved(false);
  }

  function handlePointerDown(e: React.PointerEvent, shape: PlotShape) {
    if (!editable) return;
    e.preventDefault();
    e.stopPropagation();
    setSelectedId(shape.id);
    const p = toSvgPoint(e.clientX, e.clientY);
    dragOffset.current = { dx: p.x - shape.x, dy: p.y - shape.y };
    (e.target as Element).setPointerCapture?.(e.pointerId);
  }

  function handlePointerMove(e: React.PointerEvent, shape: PlotShape) {
    if (!editable || !dragOffset.current) return;
    const p = toSvgPoint(e.clientX, e.clientY);
    const x = clamp(p.x - dragOffset.current.dx, 0, VIEW_W - shape.w);
    const y = clamp(p.y - dragOffset.current.dy, 0, VIEW_H - shape.h);
    setShapes((prev) => prev.map((s) => (s.id === shape.id ? { ...s, x, y } : s)));
    setSaved(false);
  }

  function endDrag(e: React.PointerEvent) {
    dragOffset.current = null;
    (e.target as Element).releasePointerCapture?.(e.pointerId);
  }

  async function handleSave() {
    setSaving(true);
    setSaveError('');
    setSaved(false);
    try {
      await setPlotLayout(plot.id, { shapes });
      setSaved(true);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Save failed.');
    } finally {
      setSaving(false);
    }
  }

  const svg = (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      className="w-full rounded-lg border border-gray-200 bg-garden-50/40"
      style={{ touchAction: 'none' }}
      role="img"
      aria-label="Plot layout"
      onPointerDown={() => editable && setSelectedId(null)}
    >
      {/* Bed background */}
      <rect x={1} y={1} width={VIEW_W - 2} height={VIEW_H - 2} fill="none" stroke="#d1d5db" strokeWidth={2} />
      {shapes.map((shape) => {
        const isSelected = editable && shape.id === selectedId;
        return (
          <g
            key={shape.id}
            data-shape-id={shape.id}
            data-shape-type={shape.type}
            style={{ cursor: editable ? 'move' : 'default' }}
            onPointerDown={(e) => handlePointerDown(e, shape)}
            onPointerMove={(e) => handlePointerMove(e, shape)}
            onPointerUp={endDrag}
            onLostPointerCapture={endDrag}
          >
            <ShapeGraphic shape={shape} />
            {/* Selection outline drawn on top */}
            {shape.type === 'circle' ? (
              <ellipse
                cx={shape.x + shape.w / 2}
                cy={shape.y + shape.h / 2}
                rx={shape.w / 2}
                ry={shape.h / 2}
                fill="none"
                stroke={isSelected ? '#15803d' : shape.color}
                strokeWidth={isSelected ? 3 : 1.5}
              />
            ) : shape.type === 'triangle' ? (
              <polygon
                points={`${shape.x + shape.w / 2},${shape.y} ${shape.x},${shape.y + shape.h} ${shape.x + shape.w},${shape.y + shape.h}`}
                fill="none"
                stroke={isSelected ? '#15803d' : shape.color}
                strokeWidth={isSelected ? 3 : 1.5}
              />
            ) : (
              <rect
                x={shape.x}
                y={shape.y}
                width={shape.w}
                height={shape.h}
                rx={4}
                fill="none"
                stroke={isSelected ? '#15803d' : shape.color}
                strokeWidth={isSelected ? 3 : 1.5}
              />
            )}
            {shape.label && (
              <text
                x={shape.x + shape.w / 2}
                y={shape.y + shape.h / 2}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={12}
                fill="#1f2937"
                style={{ pointerEvents: 'none', userSelect: 'none' }}
              >
                {shape.label}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );

  if (!editable) {
    return (
      <div>
        {shapes.length === 0 ? (
          <p className="text-sm text-gray-500">No layout yet.</p>
        ) : (
          svg
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-gray-500">
        Add shapes for beds, paths, and features, then drag them to arrange your plot.
      </p>

      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" type="button" className="text-xs" onClick={() => addShape('rect')}>
          + Rectangle
        </Button>
        <Button variant="secondary" type="button" className="text-xs" onClick={() => addShape('circle')}>
          + Circle
        </Button>
        <Button variant="secondary" type="button" className="text-xs" onClick={() => addShape('triangle')}>
          + Triangle
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">{svg}</div>

        {/* Properties panel */}
        <div className="rounded-lg border border-gray-200 p-3 text-sm">
          {selected ? (
            <div className="space-y-3">
              <h3 className="font-medium text-gray-700">Shape properties</h3>
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-600" htmlFor="shape-label">
                  Label
                </label>
                <input
                  id="shape-label"
                  aria-label="Shape label"
                  className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm w-full focus:outline-none focus:ring-2 focus:ring-garden-500"
                  value={selected.label}
                  onChange={(e) => updateSelected({ label: e.target.value })}
                  placeholder="e.g. Tomatoes"
                />
              </div>

              <div className="space-y-1">
                <span className="text-xs font-medium text-gray-600">Color</span>
                <div className="flex flex-wrap items-center gap-1.5">
                  {PRESET_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      aria-label={`Color ${c}`}
                      onClick={() => updateSelected({ color: c })}
                      className={`h-6 w-6 rounded-full border-2 ${
                        selected.color === c ? 'border-garden-700' : 'border-white'
                      } shadow`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                  <input
                    type="color"
                    aria-label="Custom color"
                    className="h-6 w-8 cursor-pointer rounded border border-gray-300 bg-white p-0"
                    value={selected.color}
                    onChange={(e) => updateSelected({ color: e.target.value })}
                  />
                </div>
              </div>

              <div className="flex gap-2">
                <div className="flex-1 space-y-1">
                  <label className="text-xs font-medium text-gray-600" htmlFor="shape-width">
                    Width
                  </label>
                  <input
                    id="shape-width"
                    aria-label="Shape width"
                    type="number"
                    min={10}
                    max={VIEW_W}
                    className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm w-full focus:outline-none focus:ring-2 focus:ring-garden-500"
                    value={selected.w}
                    onChange={(e) =>
                      updateSelected({ w: clamp(Number(e.target.value) || 0, 10, VIEW_W) })
                    }
                  />
                </div>
                <div className="flex-1 space-y-1">
                  <label className="text-xs font-medium text-gray-600" htmlFor="shape-height">
                    Height
                  </label>
                  <input
                    id="shape-height"
                    aria-label="Shape height"
                    type="number"
                    min={10}
                    max={VIEW_H}
                    className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm w-full focus:outline-none focus:ring-2 focus:ring-garden-500"
                    value={selected.h}
                    onChange={(e) =>
                      updateSelected({ h: clamp(Number(e.target.value) || 0, 10, VIEW_H) })
                    }
                  />
                </div>
              </div>

              <Button variant="danger" type="button" className="text-xs w-full" onClick={deleteSelected}>
                Delete shape
              </Button>
            </div>
          ) : (
            <p className="text-gray-500 text-xs">Select a shape to edit its label, color, and size.</p>
          )}
        </div>
      </div>

      {saveError && <p className="text-sm text-red-600">{saveError}</p>}
      <div className="flex items-center gap-3">
        <Button type="button" onClick={handleSave} disabled={saving} className="text-xs">
          {saving ? 'Saving…' : 'Save layout'}
        </Button>
        {saved && <span className="text-sm text-garden-700 font-medium">Saved ✓</span>}
      </div>
    </div>
  );
}
