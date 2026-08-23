import { createElement, useCallback, useEffect, useRef } from 'react';
import type { CSSProperties, JSX } from 'react';
import { TextAnimationEngine } from '../core/engine';
import { getPreset } from '../core/presets';
import { mergeTextAnimationSettings, mergeTextStyle } from '../core/config';
import type { TextAnimationSettings, TextStyle } from '../core/types';

export interface AnimatedTextProps {
  /** A preset id from src/core/presets.ts, e.g. "fade-up-words" */
  preset?: string;
  /** Full animation settings; takes precedence over `preset` if both are given. */
  settings?: TextAnimationSettings;
  /** Full text style; takes precedence over `preset` if both are given. */
  style?: TextStyle;
  /** Field-level overrides merged on top of the resolved preset/settings. */
  settingsOverrides?: Partial<TextAnimationSettings>;
  /** Field-level overrides merged on top of the resolved preset/style. */
  styleOverrides?: Partial<TextStyle>;
  /** HTML tag to render, e.g. "h1" for a hero headline. Defaults to "div". */
  as?: keyof JSX.IntrinsicElements;
  className?: string;
  containerStyle?: CSSProperties;
}

const DEFAULT_PRESET_ID = 'fade-up-words';

function resolveSettings(props: Pick<AnimatedTextProps, 'preset' | 'settings' | 'settingsOverrides'>): TextAnimationSettings {
  const base =
    props.settings ??
    getPreset(props.preset ?? DEFAULT_PRESET_ID)?.settings ??
    getPreset(DEFAULT_PRESET_ID)!.settings;
  return mergeTextAnimationSettings(base, props.settingsOverrides);
}

function resolveStyle(props: Pick<AnimatedTextProps, 'preset' | 'style' | 'styleOverrides'>): TextStyle {
  const base = props.style ?? getPreset(props.preset ?? DEFAULT_PRESET_ID)?.style ?? getPreset(DEFAULT_PRESET_ID)!.style;
  return mergeTextStyle(base, props.styleOverrides);
}

/**
 * Renders `settings.text` (or the preset's text) into the DOM and animates
 * its reveal -- fade, grow, or typewriter, per the resolved config. Unlike
 * the canvas-based grid/cellular background components, this renders real
 * text nodes so the result stays selectable, SEO-friendly, and readable by
 * screen readers (the generated per-character/word spans are `aria-hidden`
 * behind an `aria-label` carrying the plain text).
 */
export function AnimatedText({
  preset,
  settings,
  style,
  settingsOverrides,
  styleOverrides,
  as = 'div',
  className,
  containerStyle,
}: AnimatedTextProps) {
  const containerRef = useRef<HTMLElement | null>(null);
  const engineRef = useRef<TextAnimationEngine | null>(null);

  const setRef = useCallback((el: HTMLElement | null) => {
    containerRef.current = el;
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const engine = new TextAnimationEngine(
      el,
      resolveSettings({ preset, settings, settingsOverrides }),
      resolveStyle({ preset, style, styleOverrides }),
    );
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
    engineRef.current?.updateConfig(
      resolveSettings({ preset, settings, settingsOverrides }),
      resolveStyle({ preset, style, styleOverrides }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preset, settings, style, settingsOverrides, styleOverrides]);

  return createElement(as, { ref: setRef, className, style: containerStyle });
}
