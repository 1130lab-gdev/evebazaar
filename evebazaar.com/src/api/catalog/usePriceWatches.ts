import { useCallback, useEffect, useState } from 'react';
import { catalogDelete, catalogPost, catalogPut, catalogRequest } from './client';
import type { PriceWatch, PriceWatchRequest, UpdatePriceWatchRequest } from './types';

// A watch's `current_price`/`triggered` are live market state, not
// something that changes on its own in the browser -- polling is what
// actually catches a threshold being crossed while the page is sitting
// open, not just on mount. 30s balances catching a change reasonably
// promptly against not hammering the (already fast, index-only) endpoint.
const POLL_INTERVAL_MS = 30_000;

export function usePriceWatches(): {
  watches: PriceWatch[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
  createWatch: (req: PriceWatchRequest) => Promise<PriceWatch>;
  updateWatch: (watchId: number, req: UpdatePriceWatchRequest) => Promise<PriceWatch>;
  deleteWatch: (watchId: number) => Promise<void>;
} {
  const [watches, setWatches] = useState<PriceWatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    catalogRequest<PriceWatch[]>('/price-watches', controller.signal)
      .then((w) => {
        setWatches(w);
        setError(null);
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setError(err instanceof Error ? err.message : 'Failed to load price watches.');
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [version]);

  const refresh = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    const id = setInterval(refresh, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [refresh]);

  const createWatch = useCallback(async (req: PriceWatchRequest) => {
    const watch = await catalogPost<PriceWatch>('/price-watches', req);
    setVersion((v) => v + 1);
    return watch;
  }, []);

  const updateWatch = useCallback(async (watchId: number, req: UpdatePriceWatchRequest) => {
    const watch = await catalogPut<PriceWatch>(`/price-watches/${watchId}`, req);
    setVersion((v) => v + 1);
    return watch;
  }, []);

  const deleteWatch = useCallback(async (watchId: number) => {
    await catalogDelete<void>(`/price-watches/${watchId}`);
    setVersion((v) => v + 1);
  }, []);

  return { watches, loading, error, refresh, createWatch, updateWatch, deleteWatch };
}
