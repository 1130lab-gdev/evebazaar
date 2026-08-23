import type { AutomatonConfig } from './types';

/** Shallow-merges an override on top of a base config, merging `params` one level deep. */
export function mergeAutomatonConfig(
  base: AutomatonConfig,
  overrides?: Partial<AutomatonConfig>,
): AutomatonConfig {
  if (!overrides) return base;
  return {
    ...base,
    ...overrides,
    params: { ...base.params, ...overrides.params } as AutomatonConfig['params'],
  };
}
