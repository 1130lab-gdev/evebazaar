import type { TextAnimationSettings, TextStyle } from './types';

/** Shallow-merges an override on top of base settings. */
export function mergeTextAnimationSettings(
  base: TextAnimationSettings,
  overrides?: Partial<TextAnimationSettings>,
): TextAnimationSettings {
  if (!overrides) return base;
  return { ...base, ...overrides };
}

/** Shallow-merges an override on top of a base text style. */
export function mergeTextStyle(base: TextStyle, overrides?: Partial<TextStyle>): TextStyle {
  if (!overrides) return base;
  return { ...base, ...overrides };
}
