/** Fixed ISK-budget choices for the route planner: 1m, 10m, 100m, 1b, 10b,
 * 100b. Users pick one rather than typing a number, so route searches
 * cluster on a handful of cache keys. */
export const ISK_BUDGET_OPTIONS = [1_000_000, 10_000_000, 100_000_000, 1_000_000_000, 10_000_000_000, 100_000_000_000];

/** e.g. `1_000_000` -> "1,000,000 (1 million)", `100_000_000_000` ->
 * "100,000,000,000 (100 billion)". */
export function formatIskBudget(n: number): string {
  const commas = n.toLocaleString('en-US');
  const words = n >= 1_000_000_000 ? `${n / 1_000_000_000} billion` : `${n / 1_000_000} million`;
  return `${commas} (${words})`;
}
