import { defineCellularAutomataElement } from './CellularAutomataElement';
import { CellularAutomatonEngine } from '../core/engine';
import { presets, getPreset } from '../core/presets';
import type { AutomatonConfig } from '../core/types';

defineCellularAutomataElement();

export interface MountHandle {
  stop: () => void;
  updateConfig: (config: AutomatonConfig) => void;
}

export interface MountOptions {
  preset?: string;
  config?: AutomatonConfig;
}

/** Imperative alternative to the <cellular-automata-bg> custom element. */
function mount(target: HTMLCanvasElement | string, options: MountOptions = {}): MountHandle {
  const canvas = typeof target === 'string' ? document.querySelector<HTMLCanvasElement>(target) : target;
  if (!canvas) throw new Error('CellularAutomata.mount: target canvas not found');

  const config = options.config ?? getPreset(options.preset ?? presets[0].id)?.config ?? presets[0].config;
  const engine = new CellularAutomatonEngine(canvas, config);
  engine.start();

  return {
    stop: () => engine.stop(),
    updateConfig: (nextConfig: AutomatonConfig) => engine.updateConfig(nextConfig),
  };
}

const api = { mount, presets };

declare global {
  interface Window {
    CellularAutomata: typeof api;
  }
}

window.CellularAutomata = api;

export default api;
