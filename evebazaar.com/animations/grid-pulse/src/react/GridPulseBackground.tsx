import { useEffect, useRef } from 'react';
import type { CSSProperties } from 'react';
import { GridAnimationEngine } from '../core/engine';
import { getPreset } from '../core/presets';
import { mergeGridAnimationConfig } from '../core/config';
import type { GridAnimationConfig } from '../core/types';

export interface GridPulseBackgroundProps {
  /** A preset id from src/core/presets.ts, e.g. "signal-grid" */
  preset?: string;
  /** Full config; takes precedence over `preset` if both are given. */
  config?: GridAnimationConfig;
  /** Field-level overrides merged on top of the resolved preset/config. */
  overrides?: Partial<GridAnimationConfig>;
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

const DEFAULT_PRESET_ID = 'signal-grid';

function resolveConfig(props: GridPulseBackgroundProps): GridAnimationConfig {
  const base =
    props.config ??
    getPreset(props.preset ?? DEFAULT_PRESET_ID)?.config ??
    getPreset(DEFAULT_PRESET_ID)!.config;

  return mergeGridAnimationConfig(base, props.overrides);
}

export function GridPulseBackground({
  preset,
  config,
  overrides,
  fill = true,
  className,
  style,
}: GridPulseBackgroundProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<GridAnimationEngine | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const engine = new GridAnimationEngine(canvas, resolveConfig({ preset, config, overrides }));
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
