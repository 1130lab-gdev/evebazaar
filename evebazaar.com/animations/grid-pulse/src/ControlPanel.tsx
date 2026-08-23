import type { ReactNode } from 'react';
import type { Axis, BlipShape, GridAnimationConfig, GridLayerConfig } from './core/types';

interface ControlPanelProps {
  config: GridAnimationConfig;
  onChange: (patch: Partial<GridAnimationConfig>) => void;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
    </label>
  );
}

const LAYER_LABELS: Record<GridLayerConfig['kind'], string> = {
  dashedGrid: 'Dashed grid',
  pulseBoxes: 'Pulse boxes',
  travelingBeams: 'Traveling beams',
  blips: 'Blips',
};

const AXIS_OPTIONS: Array<{ value: Axis; label: string }> = [
  { value: 'both', label: 'Both' },
  { value: 'horizontal', label: 'Horizontal only' },
  { value: 'vertical', label: 'Vertical only' },
];

export function ControlPanel({ config, onChange }: ControlPanelProps) {
  const updateLayer = <T extends GridLayerConfig>(index: number, patch: Partial<T>) => {
    const layers = config.layers.map((layer, i) => (i === index ? ({ ...layer, ...patch } as GridLayerConfig) : layer));
    onChange({ layers });
  };

  return (
    <div className="control-panel">
      <Field label={`Cell size: ${config.cellSize}px`}>
        <input
          type="range"
          min={16}
          max={96}
          value={config.cellSize}
          onChange={(e) => onChange({ cellSize: Number(e.target.value) })}
        />
      </Field>

      <Field label="Background">
        <input
          type="color"
          value={/^#/.test(config.background) ? config.background : '#000000'}
          onChange={(e) => onChange({ background: e.target.value })}
        />
      </Field>

      {config.layers.map((layer, i) => (
        <div className="layer-group" key={i}>
          <hr />
          <div className="layer-title">{LAYER_LABELS[layer.kind]}</div>

          {layer.kind === 'dashedGrid' && (
            <>
              <Field label="Axis">
                <select value={layer.axis} onChange={(e) => updateLayer(i, { axis: e.target.value as Axis })}>
                  {AXIS_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Color">
                <input type="color" value={layer.color} onChange={(e) => updateLayer(i, { color: e.target.value })} />
              </Field>
              <Field label={`Opacity: ${layer.opacity.toFixed(2)}`}>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={layer.opacity}
                  onChange={(e) => updateLayer(i, { opacity: Number(e.target.value) })}
                />
              </Field>
              <Field label={`Dash: ${layer.dash[0]}px / gap ${layer.dash[1]}px`}>
                <input
                  type="range"
                  min={0}
                  max={20}
                  value={layer.dash[0]}
                  onChange={(e) => updateLayer(i, { dash: [Number(e.target.value), layer.dash[1]] })}
                />
                <input
                  type="range"
                  min={0}
                  max={20}
                  value={layer.dash[1]}
                  onChange={(e) => updateLayer(i, { dash: [layer.dash[0], Number(e.target.value)] })}
                />
              </Field>
              <Field label={`Scroll speed: ${layer.scrollSpeed}px/s`}>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={layer.scrollSpeed}
                  onChange={(e) => updateLayer(i, { scrollSpeed: Number(e.target.value) })}
                />
              </Field>
            </>
          )}

          {layer.kind === 'pulseBoxes' && (
            <>
              <Field label="Color">
                <input type="color" value={layer.color} onChange={(e) => updateLayer(i, { color: e.target.value })} />
              </Field>
              <Field label={`Density: ${layer.density.toFixed(2)}`}>
                <input
                  type="range"
                  min={0.01}
                  max={0.3}
                  step={0.01}
                  value={layer.density}
                  onChange={(e) => updateLayer(i, { density: Number(e.target.value) })}
                />
              </Field>
              <Field label={`Period: ${layer.periodMs}ms`}>
                <input
                  type="range"
                  min={400}
                  max={6000}
                  step={100}
                  value={layer.periodMs}
                  onChange={(e) => updateLayer(i, { periodMs: Number(e.target.value) })}
                />
              </Field>
              <Field label="Filled">
                <input type="checkbox" checked={layer.fill} onChange={(e) => updateLayer(i, { fill: e.target.checked })} />
              </Field>
              <Field label={`Max opacity: ${layer.maxOpacity.toFixed(2)}`}>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={layer.maxOpacity}
                  onChange={(e) => updateLayer(i, { maxOpacity: Number(e.target.value) })}
                />
              </Field>
            </>
          )}

          {layer.kind === 'travelingBeams' && (
            <>
              <Field label="Direction">
                <select value={layer.spawnAxis} onChange={(e) => updateLayer(i, { spawnAxis: e.target.value as Axis })}>
                  {AXIS_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Color">
                <input type="color" value={layer.color} onChange={(e) => updateLayer(i, { color: e.target.value })} />
              </Field>
              <Field label={`Count: ${layer.count}`}>
                <input
                  type="range"
                  min={1}
                  max={24}
                  value={layer.count}
                  onChange={(e) => updateLayer(i, { count: Number(e.target.value) })}
                />
              </Field>
              <Field label={`Speed: ${layer.speed}px/s`}>
                <input
                  type="range"
                  min={20}
                  max={600}
                  value={layer.speed}
                  onChange={(e) => updateLayer(i, { speed: Number(e.target.value) })}
                />
              </Field>
              <Field label={`Length: ${layer.length}px`}>
                <input
                  type="range"
                  min={20}
                  max={300}
                  value={layer.length}
                  onChange={(e) => updateLayer(i, { length: Number(e.target.value) })}
                />
              </Field>
              <Field label={`Glow: ${layer.glow}px`}>
                <input
                  type="range"
                  min={0}
                  max={30}
                  value={layer.glow}
                  onChange={(e) => updateLayer(i, { glow: Number(e.target.value) })}
                />
              </Field>
            </>
          )}

          {layer.kind === 'blips' && (
            <>
              <Field label="Shape">
                <select value={layer.shape} onChange={(e) => updateLayer(i, { shape: e.target.value as BlipShape })}>
                  <option value="circle">Circle</option>
                  <option value="square">Square</option>
                </select>
              </Field>
              <Field label="Color">
                <input type="color" value={layer.color} onChange={(e) => updateLayer(i, { color: e.target.value })} />
              </Field>
              <Field label={`Count: ${layer.count}`}>
                <input
                  type="range"
                  min={1}
                  max={40}
                  value={layer.count}
                  onChange={(e) => updateLayer(i, { count: Number(e.target.value) })}
                />
              </Field>
              <Field label={`Size: ${layer.size}px`}>
                <input
                  type="range"
                  min={2}
                  max={40}
                  value={layer.size}
                  onChange={(e) => updateLayer(i, { size: Number(e.target.value) })}
                />
              </Field>
              <Field label={`Lifetime: ${layer.lifetimeMs}ms`}>
                <input
                  type="range"
                  min={200}
                  max={4000}
                  step={50}
                  value={layer.lifetimeMs}
                  onChange={(e) => updateLayer(i, { lifetimeMs: Number(e.target.value) })}
                />
              </Field>
              <Field label={`Gap between appearances: ${layer.gapMs}ms`}>
                <input
                  type="range"
                  min={0}
                  max={4000}
                  step={50}
                  value={layer.gapMs}
                  onChange={(e) => updateLayer(i, { gapMs: Number(e.target.value) })}
                />
              </Field>
              <Field label="Filled">
                <input type="checkbox" checked={layer.fill} onChange={(e) => updateLayer(i, { fill: e.target.checked })} />
              </Field>
              <Field label={`Bloom glow: ${layer.glow}px`}>
                <input
                  type="range"
                  min={0}
                  max={30}
                  value={layer.glow}
                  onChange={(e) => updateLayer(i, { glow: Number(e.target.value) })}
                />
              </Field>
              <Field label={`Max opacity: ${layer.maxOpacity.toFixed(2)}`}>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={layer.maxOpacity}
                  onChange={(e) => updateLayer(i, { maxOpacity: Number(e.target.value) })}
                />
              </Field>
            </>
          )}
        </div>
      ))}
    </div>
  );
}
