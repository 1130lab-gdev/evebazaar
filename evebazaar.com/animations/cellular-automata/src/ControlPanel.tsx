import type { ReactNode } from 'react';
import type { AutomatonConfig } from './core/types';

interface ControlPanelProps {
  config: AutomatonConfig;
  onChange: (patch: Partial<AutomatonConfig>) => void;
}

function randomHexColor(): string {
  return '#' + Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0');
}

function adjustPaletteLength(colors: string[], count: number): string[] {
  if (colors.length === count) return colors;
  if (colors.length > count) return colors.slice(0, count);
  return [...colors, ...Array.from({ length: count - colors.length }, randomHexColor)];
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
    </label>
  );
}

export function ControlPanel({ config, onChange }: ControlPanelProps) {
  const { params } = config;

  const setColor = (index: number, value: string) => {
    const colors = [...config.colors];
    colors[index] = value;
    onChange({ colors });
  };

  return (
    <div className="control-panel">
      <Field label={`Cell size: ${config.cellSize}px`}>
        <input
          type="range"
          min={2}
          max={24}
          value={config.cellSize}
          onChange={(e) => onChange({ cellSize: Number(e.target.value) })}
        />
      </Field>

      <Field label={`Speed: ${config.stepIntervalMs}ms / step`}>
        <input
          type="range"
          min={16}
          max={400}
          value={config.stepIntervalMs}
          onChange={(e) => onChange({ stepIntervalMs: Number(e.target.value) })}
        />
      </Field>

      <div className="field">
        <span className="field-label">Colors</span>
        <div className="swatch-row">
          {config.colors.map((color, i) => (
            <input
              key={i}
              type="color"
              value={color}
              title={`State ${i}`}
              onChange={(e) => setColor(i, e.target.value)}
            />
          ))}
        </div>
      </div>

      <hr />

      {params.kind === 'elementary' && (
        <>
          <Field label={`Wolfram rule: ${params.rule}`}>
            <input
              type="range"
              min={0}
              max={255}
              value={params.rule}
              onChange={(e) => onChange({ params: { ...params, rule: Number(e.target.value) } })}
            />
          </Field>
          <Field label="Reseed when pattern dies out">
            <input
              type="checkbox"
              checked={params.randomSeed ?? false}
              onChange={(e) => onChange({ params: { ...params, randomSeed: e.target.checked } })}
            />
          </Field>
          {params.randomSeed && (
            <Field label={`Seed density: ${(params.density ?? 0.35).toFixed(2)}`}>
              <input
                type="range"
                min={0.05}
                max={0.9}
                step={0.05}
                value={params.density ?? 0.35}
                onChange={(e) => onChange({ params: { ...params, density: Number(e.target.value) } })}
              />
            </Field>
          )}
        </>
      )}

      {params.kind === 'cyclic' && (
        <>
          <Field label={`States: ${params.states}`}>
            <input
              type="range"
              min={2}
              max={16}
              value={params.states}
              onChange={(e) => {
                const states = Number(e.target.value);
                onChange({ colors: adjustPaletteLength(config.colors, states), params: { ...params, states } });
              }}
            />
          </Field>
          <Field label={`Threshold: ${params.threshold}`}>
            <input
              type="range"
              min={1}
              max={8}
              value={params.threshold}
              onChange={(e) => onChange({ params: { ...params, threshold: Number(e.target.value) } })}
            />
          </Field>
          <Field label="Neighborhood">
            <select
              value={params.neighborhood}
              onChange={(e) => onChange({ params: { ...params, neighborhood: e.target.value as 'moore' | 'vonNeumann' } })}
            >
              <option value="moore">Moore (8 neighbors)</option>
              <option value="vonNeumann">Von Neumann (4 neighbors)</option>
            </select>
          </Field>
        </>
      )}

      {params.kind === 'life' && (
        <>
          <Field label={`Initial density: ${params.density.toFixed(2)}`}>
            <input
              type="range"
              min={0.05}
              max={0.6}
              step={0.05}
              value={params.density}
              onChange={(e) => onChange({ params: { ...params, density: Number(e.target.value) } })}
            />
          </Field>
          <Field label="Wrap edges">
            <input
              type="checkbox"
              checked={params.wrap}
              onChange={(e) => onChange({ params: { ...params, wrap: e.target.checked } })}
            />
          </Field>
        </>
      )}
    </div>
  );
}
