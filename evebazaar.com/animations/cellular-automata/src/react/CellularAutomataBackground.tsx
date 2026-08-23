import { useEffect, useRef } from 'react';
import type { CSSProperties } from 'react';
import { CellularAutomatonEngine } from '../core/engine';
import { getPreset } from '../core/presets';
import { mergeAutomatonConfig } from '../core/config';
import type { AutomatonConfig } from '../core/types';

export interface CellularAutomataBackgroundProps {
  /** A preset id from src/core/presets.ts, e.g. "futuristic-horizontal-lines" */
  preset?: string;
  /** Full config; takes precedence over `preset` if both are given. */
  config?: AutomatonConfig;
  /** Field-level overrides merged on top of the resolved preset/config. */
  overrides?: Partial<AutomatonConfig>;
  /**
   * When true (default), the canvas is absolutely positioned to fill its
   * parent element. The parent must have `position: relative` (or similar)
   * for this to work, and other content in the parent should have a higher
   * z-index to render above the animation.
   */
  fill?: boolean;
  className?: string;
  style?: CSSProperties;
}

const DEFAULT_PRESET_ID = 'futuristic-horizontal-lines';

function resolveConfig(props: CellularAutomataBackgroundProps): AutomatonConfig {
  const base =
    props.config ??
    getPreset(props.preset ?? DEFAULT_PRESET_ID)?.config ??
    getPreset(DEFAULT_PRESET_ID)!.config;

  return mergeAutomatonConfig(base, props.overrides);
}

export function CellularAutomataBackground({
  preset,
  config,
  overrides,
  fill = true,
  className,
  style,
}: CellularAutomataBackgroundProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<CellularAutomatonEngine | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const engine = new CellularAutomatonEngine(canvas, resolveConfig({ preset, config, overrides }));
    engineRef.current = engine;
    engine.start();
    return () => {
      engine.stop();
      engineRef.current = null;
    };
    // Engine is intentionally re-created only on mount; see update effect below for live changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    engineRef.current?.updateConfig(resolveConfig({ preset, config, overrides }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preset, config, overrides]);

  const fillStyle: CSSProperties = fill
    ? { position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block' }
    : { width: '100%', height: '100%', display: 'block' };

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{ ...fillStyle, ...style }}
      aria-hidden="true"
    />
  );
}
