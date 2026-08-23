const integerFormatter = new Intl.NumberFormat('en-US');

export function formatIsk(value: number): string {
  return `${integerFormatter.format(value)} ISK`;
}

export function formatQty(value: number): string {
  return integerFormatter.format(value);
}

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', { hour12: false });
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-US', { hour12: false });
}

export function formatClockTime(epochMs: number): string {
  return new Date(epochMs).toLocaleTimeString('en-US', { hour12: false });
}

export function formatSecStatus(sec: number): string {
  return sec.toFixed(1);
}

export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const minutes = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return `${minutes}m ${secs}s`;
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

/**
 * Item packaged volumes span from 0.01 m³ (gas, minerals) to 1,300,000 m³
 * (capital ships) -- small items need decimal precision to be readable at
 * all, large ones would just get noisy digits from it.
 */
export function formatVolume(m3: number): string {
  if (m3 < 1) return `${m3.toFixed(2)} m³`;
  return `${integerFormatter.format(Math.round(m3))} m³`;
}
