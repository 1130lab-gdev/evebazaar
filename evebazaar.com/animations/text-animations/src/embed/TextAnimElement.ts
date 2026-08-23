import { TextAnimationEngine } from '../core/engine';
import { getPreset } from '../core/presets';
import type { TextAnimationSettings, TextStyle } from '../core/types';

const DEFAULT_PRESET_ID = 'fade-up-words';

/**
 * <text-anim preset="terminal-typewriter"></text-anim>
 *
 * Framework-free custom element for embedding an animated text reveal
 * directly in WordPress (Custom HTML block, theme template, etc.) after
 * loading the built embed script. Unlike the grid-pulse/cellular-automata
 * background elements, this renders real text content sized to itself --
 * it is not absolutely positioned and does not fill its parent.
 *
 * Attributes:
 *  - preset: id from src/core/presets.ts (default "fade-up-words")
 *  - settings: JSON string of a full TextAnimationSettings, overrides the preset's settings if present
 *  - text-style: JSON string of a full TextStyle, overrides the preset's style if present
 *  - text: plain string, overrides just the `text` field of the resolved settings
 */
export class TextAnimElement extends HTMLElement {
  static get observedAttributes() {
    return ['preset', 'settings', 'text-style', 'text'];
  }

  private engine: TextAnimationEngine | null = null;

  connectedCallback(): void {
    this.mountEngine();
  }

  disconnectedCallback(): void {
    this.engine?.stop();
    this.engine = null;
  }

  attributeChangedCallback(): void {
    if (!this.isConnected) return;
    if (this.engine) {
      this.engine.updateConfig(this.resolveSettings(), this.resolveStyle());
    } else {
      this.mountEngine();
    }
  }

  private resolveSettings(): TextAnimationSettings {
    const presetId = this.getAttribute('preset') ?? DEFAULT_PRESET_ID;
    let settings = (getPreset(presetId) ?? getPreset(DEFAULT_PRESET_ID)!).settings;

    const settingsAttr = this.getAttribute('settings');
    if (settingsAttr) {
      try {
        settings = JSON.parse(settingsAttr) as TextAnimationSettings;
      } catch (err) {
        console.error('[text-anim] invalid settings JSON attribute, falling back to preset', err);
      }
    }

    const textOverride = this.getAttribute('text');
    if (textOverride !== null) {
      settings = { ...settings, text: textOverride };
    }
    return settings;
  }

  private resolveStyle(): TextStyle {
    const presetId = this.getAttribute('preset') ?? DEFAULT_PRESET_ID;
    const base = (getPreset(presetId) ?? getPreset(DEFAULT_PRESET_ID)!).style;

    const styleAttr = this.getAttribute('text-style');
    if (styleAttr) {
      try {
        return JSON.parse(styleAttr) as TextStyle;
      } catch (err) {
        console.error('[text-anim] invalid text-style JSON attribute, falling back to preset', err);
      }
    }
    return base;
  }

  private mountEngine(): void {
    this.engine?.stop();
    this.engine = new TextAnimationEngine(this, this.resolveSettings(), this.resolveStyle());
    this.engine.start();
  }
}

export function defineTextAnimElement(tagName = 'text-anim'): void {
  if (!customElements.get(tagName)) {
    customElements.define(tagName, TextAnimElement);
  }
}
