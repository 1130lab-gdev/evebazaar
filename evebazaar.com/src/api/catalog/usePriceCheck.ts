import { useCallback, useState } from 'react';
import { catalogPost } from './client';
import type { LegPriceCheck, PriceCheckLegRequest } from './types';

/** On-demand re-quote of a set of legs against the live market -- not
 * auto-refreshing, since this is meant for a route plan a trader might
 * pull up 30+ minutes after building it and needs an explicit "is this
 * still good?" check on, not a live feed. Results come back in the same
 * order `legs` was passed in, so the caller zips them onto its own leg
 * list by index. */
export function usePriceCheck(): {
  checks: LegPriceCheck[] | null;
  loading: boolean;
  error: string | null;
  checkPrices: (legs: PriceCheckLegRequest[]) => Promise<void>;
} {
  const [checks, setChecks] = useState<LegPriceCheck[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const checkPrices = useCallback(async (legs: PriceCheckLegRequest[]) => {
    setLoading(true);
    setError(null);
    try {
      const result = await catalogPost<LegPriceCheck[]>('/price-checks', { legs });
      setChecks(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to check prices.');
    } finally {
      setLoading(false);
    }
  }, []);

  return { checks, loading, error, checkPrices };
}
