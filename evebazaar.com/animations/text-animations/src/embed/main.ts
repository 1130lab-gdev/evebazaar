import { defineTextAnimElement } from './TextAnimElement';
import { TextAnimationEngine } from '../core/engine';
import { presets, getPreset } from '../core/presets';
import type { TextAnimationSettings, TextStyle } from '../core/types';

defineTextAnimElement();

export interface MountHandle {
  stop: () => void;
  /** Restarts the reveal timeline from scratch. */
  replay: () => void;
  updateConfig: (settings: TextAnimationSettings, style: TextStyle) => void;
}

export interface MountOptions {
  preset?: string;
  settings?: TextAnimationSettings;
  style?: TextStyle;
}

/** Imperative alternative to the <text-anim> custom element. */
function mount(target: HTMLElement | string, options: MountOptions = {}): MountHandle {
  const container = typeof target === 'string' ? document.querySelector<HTMLElement>(target) : target;
  if (!container) throw new Error('TextAnimations.mount: target element not found');

  const preset = getPreset(options.preset ?? presets[0].id) ?? presets[0];
  const settings = options.settings ?? preset.settings;
  const style = options.style ?? preset.style;

  const engine = new TextAnimationEngine(container, settings, style);
  engine.start();

  return {
    stop: () => engine.stop(),
    replay: () => engine.replay(),
    updateConfig: (nextSettings: TextAnimationSettings, nextStyle: TextStyle) => engine.updateConfig(nextSettings, nextStyle),
  };
}

const api = { mount, presets };

declare global {
  interface Window {
    TextAnimations: typeof api;
  }
}

window.TextAnimations = api;

export default api;
