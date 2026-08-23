export type SplitUnit = 'chars' | 'words' | 'lines';

export interface FadeAnimationConfig {
  kind: 'fade';
  /** Granularity each fade-in "unit" is split into. */
  splitBy: SplitUnit;
  /** Fade duration per unit, in ms. */
  durationMs: number;
  /** Delay between each unit's fade starting, in ms. */
  staggerMs: number;
  /** Opacity units start at before fading to 1. */
  startOpacity: number;
  /** px offset units start at on the Y axis (positive = from below), 0 disables. */
  translateY: number;
  /** px offset units start at on the X axis, 0 disables. */
  translateX: number;
  /** CSS easing function, e.g. "ease-out", "cubic-bezier(.2,.8,.2,1)". */
  easing: string;
}

export type GrowOrigin = 'center' | 'left' | 'right' | 'top' | 'bottom';

export interface GrowAnimationConfig {
  kind: 'grow';
  splitBy: SplitUnit;
  durationMs: number;
  staggerMs: number;
  /** Scale units start at before growing to 1 (e.g. 0.5). */
  startScale: number;
  /** px of blur units start at before sharpening to 0. 0 disables. */
  blurPx: number;
  /** Whether to also fade opacity 0 -> 1 alongside the scale/blur. */
  fade: boolean;
  /** transform-origin for the scale. */
  origin: GrowOrigin;
  easing: string;
}

export type CursorStyle = 'bar' | 'block' | 'underscore';

export interface TypewriterCursorConfig {
  enabled: boolean;
  style: CursorStyle;
  /** Overrides the glyph implied by `style` if set. */
  char?: string;
  color: string;
  /** Blink cycle duration in ms; 0 keeps the cursor solid (no blink). */
  blinkMs: number;
  /** Hide the cursor once typing finishes and isn't looping. */
  hideOnComplete: boolean;
}

export interface TypewriterAnimationConfig {
  kind: 'typewriter';
  /** ms between each typed character. */
  charIntervalMs: number;
  /** 0-1 randomization applied to charIntervalMs per character, for a less robotic feel. */
  charIntervalJitter: number;
  /** ms to wait before the first character is typed. */
  startDelayMs: number;
  /** ms between each deleted character during a loop's erase phase. */
  eraseIntervalMs: number;
  cursor: TypewriterCursorConfig;
}

export type TextAnimationConfig = FadeAnimationConfig | GrowAnimationConfig | TypewriterAnimationConfig;

export type AnimationTrigger = 'mount' | 'inView';

export interface TextAnimationSettings {
  text: string;
  animation: TextAnimationConfig;
  /** "mount" starts immediately; "inView" waits until the element scrolls into the viewport. */
  trigger: AnimationTrigger;
  /** Replay from scratch after finishing (typewriter: type -> hold -> erase -> hold -> retype). */
  loop: boolean;
  /** ms to hold the fully-revealed state before looping again. */
  loopDelayMs: number;
}

export type TextAlign = 'left' | 'center' | 'right';

export interface TextStyle {
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  color: string;
  letterSpacing: number;
  lineHeight: number;
  textAlign: TextAlign;
}

export interface Preset {
  id: string;
  name: string;
  description: string;
  settings: TextAnimationSettings;
  style: TextStyle;
}
