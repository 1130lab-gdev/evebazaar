import { useEffect, useState } from 'react';
import { catalogRequest } from './client';
import type { MarketOrder, OrderFilters } from './types';

// Deep enough to show real book depth without asking the API for
// everything; catalog-api caps a single call at 100 per side anyway.
const PER_SIDE_LIMIT = 100;

function sideQuery(typeId: number, side: 'buy' | 'sell', filters: OrderFilters): string {
  const p = new URLSearchParams();
  p.set('type_id', String(typeId));
  p.set('side', side);
  for (const regionId of filters.regionIds) p.append('region_id', String(regionId));
  if (filters.minPrice !== null) p.set('min_price', String(filters.minPrice));
  if (filters.maxPrice !== null) p.set('max_price', String(filters.maxPrice));
  if (filters.minQty !== null) p.set('min_qty', String(filters.minQty));
  for (const cls of filters.securityClasses) p.append('security_class', cls);
  p.set('limit', String(PER_SIDE_LIMIT));
  return p.toString();
}

/**
 * Fetches both sides of the book for one item and hands them back already
 * best-first: `asks` ascending by price (cheapest sell first), `bids`
 * descending (highest buy first) -- catalog-api's `/market/orders` sorts
 * each side that way server-side when `side` is set, so this is just two
 * calls, no client-side re-sort. Keyed on the built query strings so an
 * unrelated re-render doesn't refetch.
 */
export function useOrderBook(
  typeId: number | null,
  filters: OrderFilters,
): { asks: MarketOrder[]; bids: MarketOrder[]; loading: boolean; error: string | null } {
  const [asks, setAsks] = useState<MarketOrder[]>([]);
  const [bids, setBids] = useState<MarketOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const asksQuery = typeId !== null ? sideQuery(typeId, 'sell', filters) : null;
  const bidsQuery = typeId !== null ? sideQuery(typeId, 'buy', filters) : null;

  useEffect(() => {
    if (asksQuery === null || bidsQuery === null) {
      setAsks([]);
      setBids([]);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    Promise.all([
      catalogRequest<MarketOrder[]>(`/market/orders?${asksQuery}`, controller.signal),
      catalogRequest<MarketOrder[]>(`/market/orders?${bidsQuery}`, controller.signal),
    ])
      .then(([sell, buy]) => {
        setAsks(sell);
        setBids(buy);
        setError(null);
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setError(err instanceof Error ? err.message : 'Failed to load the order book.');
      })
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, [asksQuery, bidsQuery]);

  return { asks, bids, loading, error };
}
