import type { ArbitrageSecurityProfile } from '../api/catalog/types';

/** Security-space choices shared by the route planner and the
 * opportunities scanner. Each one is a hard constraint on where a trade
 * may buy or sell, and also steers the jump path between stops (see
 * catalog-api's `allowed_security_classes` / `SecurityMultipliers`). */
export const SECURITY_PROFILE_OPTIONS: { value: ArbitrageSecurityProfile | ''; label: string }[] = [
  { value: 'high_sec_only', label: 'High-sec only' },
  { value: 'low_sec_plus', label: 'High + low-sec' },
  { value: '', label: 'Anywhere (incl. null-sec)' },
];
