import type { GridAnimationConfig } from './types';

/** Shallow-merges an override on top of a base config. `layers`, if present on the override, replaces the base array wholesale. */
export function mergeGridAnimationConfig(
  base: GridAnimationConfig,
  overrides?: Partial<GridAnimationConfig>,
): GridAnimationConfig {
  if (!overrides) return base;
  return { ...base, ...overrides };
}
