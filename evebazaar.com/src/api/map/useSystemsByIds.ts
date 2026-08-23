import { useEffect, useState } from 'react';
import { mapRequest } from './client';
import type { SystemSummary } from './types';

const cache = new Map<number, Promise<SystemSummary>>();

function loadSystem(id: number): Promise<SystemSummary> {
  let entry = cache.get(id);
  if (!entry) {
    entry = mapRequest<SystemSummary>(`/systems/${id}`);
    cache.set(id, entry);
  }
  return entry;
}

/**
 * Fetches full SystemSummary (incl. position) for each id -- needed because
 * RouteResponse.systems (RouteSystem) deliberately omits position fields.
 * One request per id, but route lengths are small, and results are cached
 * across route computations.
 */
export function useSystemsByIds(ids: number[]): {
  systemsById: Map<number, SystemSummary>;
  loading: boolean;
  error: string | null;
} {
  const key = ids.join(',');
  const [systemsById, setSystemsById] = useState<Map<number, SystemSummary>>(new Map());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (ids.length === 0) {
      setSystemsById(new Map());
      return;
    }
    let cancelled = false;
    setLoading(true);
    Promise.all(ids.map((id) => loadSystem(id)))
      .then((results) => {
        if (!cancelled) {
          setSystemsById(new Map(results.map((s): [number, SystemSummary] => [s.system_id, s])));
          setError(null);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load route systems.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // `key` (not `ids`) is the dep on purpose -- callers pass a freshly
    // mapped array each render, which would otherwise refetch every render.
  }, [key]);

  return { systemsById, loading, error };
}
