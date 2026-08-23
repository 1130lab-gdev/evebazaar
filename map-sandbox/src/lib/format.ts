export function formatSecStatus(sec: number): string {
  return sec.toFixed(1);
}

export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const minutes = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return `${minutes}m ${secs}s`;
}

export function formatLy(lightYears: number): string {
  return `${lightYears.toFixed(2)} ly`;
}

const KM_PER_AU = 149_597_870.7;

/**
 * Most in-system stargate pairs are tens of thousands of km apart, but a
 * few systems place gates on genuinely interplanetary scales (real data:
 * some of Jita's own gate pairs are billions of km, tens of AU, apart) --
 * a single km figure would be an unreadable wall of digits for those, so
 * this switches unit by magnitude rather than picking one for everything.
 */
export function formatDistance(meters: number): string {
  const km = meters / 1000;
  if (km < KM_PER_AU * 0.05) return `${Math.round(km).toLocaleString()} km`;
  return `${(km / KM_PER_AU).toFixed(2)} AU`;
}
