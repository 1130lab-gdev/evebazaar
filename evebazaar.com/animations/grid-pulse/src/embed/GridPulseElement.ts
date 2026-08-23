import { GridAnimationEngine } from '../core/engine';
import { getPreset } from '../core/presets';
import type { GridAnimationConfig } from '../core/types';

const DEFAULT_PRESET_ID = 'signal-grid';

/**
 * <grid-pulse-bg preset="signal-grid"></grid-pulse-bg>
 *
 * Framework-free custom element for embedding directly in WordPress (Custom
 * HTML block, theme template, etc.) after loading the built embed script.
 * By default it fills its parent element absolutely, so the parent needs
 * `position: relative` (or similar) and any foreground content needs a
 * higher `z-index`. Set the `fill="false"` attribute to opt out and size it
 * yourself instead.
 *
 * Attributes:
 *  - preset: id from src/core/presets.ts (default "signal-grid")
 *  - config: JSON string of a full GridAnimationConfig, overrides `preset` if present
 *  - fill: "false" to disable automatic absolute-fill positioning
 */
export class GridPulseElement extends HTMLElement {
  static get observedAttributes() {
    return ['preset', 'config', 'fill'];
  }

  private canvas: HTMLCanvasElement | null = null;
  private engine: GridAnimationEngine | null = null;

  connectedCallback(): void {
    this.applyFillStyles();
    if (!this.canvas) {
      this.canvas = document.createElement('canvas');
      this.canvas.style.display = 'block';
      this.canvas.style.width = '100%';
      this.canvas.style.height = '100%';
      this.appendChild(this.canvas);
    }
    this.mountEngine();
  }

  disconnectedCallback(): void {
    this.engine?.stop();
    this.engine = null;
  }

  attributeChangedCallback(name: string): void {
    if (!this.isConnected) return;
    if (name === 'fill') {
      this.applyFillStyles();
      return;
    }
    if (this.engine) {
      this.engine.updateConfig(this.resolveConfig());
    } else {
      this.mountEngine();
    }
  }

  private applyFillStyles(): void {
    if (this.getAttribute('fill') === 'false') return;
    this.style.position = this.style.position || 'absolute';
    this.style.inset = this.style.inset || '0';
    this.style.width = this.style.width || '100%';
    this.style.height = this.style.height || '100%';
    this.style.display = this.style.display || 'block';
    this.style.pointerEvents = this.style.pointerEvents || 'none';
  }

  private resolveConfig(): GridAnimationConfig {
    const configAttr = this.getAttribute('config');
    if (configAttr) {
      try {
        return JSON.parse(configAttr) as GridAnimationConfig;
      } catch (err) {
        console.error('[grid-pulse-bg] invalid config JSON attribute, falling back to preset', err);
      }
    }
    const presetId = this.getAttribute('preset') ?? DEFAULT_PRESET_ID;
    return (getPreset(presetId) ?? getPreset(DEFAULT_PRESET_ID)!).config;
  }

  private mountEngine(): void {
    if (!this.canvas) return;
    this.engine?.stop();
    this.engine = new GridAnimationEngine(this.canvas, this.resolveConfig());
    this.engine.start();
  }
}

export function defineGridPulseElement(tagName = 'grid-pulse-bg'): void {
  if (!customElements.get(tagName)) {
    customElements.define(tagName, GridPulseElement);
  }
}
