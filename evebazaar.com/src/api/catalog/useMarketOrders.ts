import { useEffect, useState } from 'react';
import { catalogRequest } from './client';
import type { MarketOrder, OrderFilters } from './types';

export const ORDERS_PAGE_SIZE = 25;

function buildQuery(typeId: number, filters: OrderFilters, page: number): string {
  const params = new URLSearchParams();
  params.set('type_id', String(typeId));
  for (const regionId of filters.regionIds) params.append('region_id', String(regionId));
  if (filters.side) params.set('side', filters.side);
  if (filters.minPrice !== null) params.set('min_price', String(filters.minPrice));
  if (filters.maxPrice !== null) params.set('max_price', String(filters.maxPrice));
  if (filters.minQty !== null) params.set('min_qty', String(filters.minQty));
  for (const cls of filters.securityClasses) params.append('security_class', cls);
  params.set('limit', String(ORDERS_PAGE_SIZE));
  params.set('offset', String(page * ORDERS_PAGE_SIZE));
  return params.toString();
}

export function useMarketOrders(
  typeId: number | null,
  filters: OrderFilters,
  page: number,
): { orders: MarketOrder[]; loading: boolean; error: string | null } {
  const [orders, setOrders] = useState<MarketOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filters/page are primitives spread into the query string, so this
  // effect's dependency is the resulting string -- reacting to filters-by-
  // reference would refetch on every render even when nothing changed.
  const query = typeId !== null ? buildQuery(typeId, filters, page) : null;

  useEffect(() => {
    if (query === null) {
      setOrders([]);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    catalogRequest<MarketOrder[]>(`/market/orders?${query}`, controller.signal)
      .then((o) => {
        setOrders(o);
        setError(null);
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setError(err instanceof Error ? err.message : 'Failed to load market orders.');
      })
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, [query]);

  return { orders, loading, error };
}
