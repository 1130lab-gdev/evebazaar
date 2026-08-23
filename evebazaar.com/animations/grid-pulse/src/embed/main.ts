import { defineGridPulseElement } from './GridPulseElement';
import { GridAnimationEngine } from '../core/engine';
import { presets, getPreset } from '../core/presets';
import type { GridAnimationConfig } from '../core/types';

defineGridPulseElement();

export interface MountHandle {
  stop: () => void;
  updateConfig: (config: GridAnimationConfig) => void;
}

export interface MountOptions {
  preset?: string;
  config?: GridAnimationConfig;
}

/** Imperative alternative to the <grid-pulse-bg> custom element. */
function mount(target: HTMLCanvasElement | string, options: MountOptions = {}): MountHandle {
  const canvas = typeof target === 'string' ? document.querySelector<HTMLCanvasElement>(target) : target;
  if (!canvas) throw new Error('GridPulse.mount: target canvas not found');

  const config = options.config ?? getPreset(options.preset ?? presets[0].id)?.config ?? presets[0].config;
  const engine = new GridAnimationEngine(canvas, config);
  engine.start();

  return {
    stop: () => engine.stop(),
    updateConfig: (nextConfig: GridAnimationConfig) => engine.updateConfig(nextConfig),
  };
}

const api = { mount, presets };

declare global {
  interface Window {
    GridPulse: typeof api;
  }
}

window.GridPulse = api;

export default api;
