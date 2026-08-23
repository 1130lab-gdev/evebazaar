import { useEffect, useState } from 'react';
import { buildQuery, mapRequest } from './client';
import type { Constellation } from './types';

// Keyed by region_id (or 'all') -- constellations don't change at runtime,
// so each distinct filter is fetched once and shared across consumers.
const cache = new Map<string, Promise<Constellation[]>>();

function loadConstellations(regionId?: number): Promise<Constellation[]> {
  const key = regionId != null ? String(regionId) : 'all';
  let entry = cache.get(key);
  if (!entry) {
    entry = mapRequest<Constellation[]>(`/constellations${buildQuery({ region_id: regionId })}`);
    cache.set(key, entry);
  }
  return entry;
}

export function useConstellations(regionId?: number): {
  constellations: Constellation[];
  loading: boolean;
  error: string | null;
} {
  const [constellations, setConstellations] = useState<Constellation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    loadConstellations(regionId)
      .then((c) => {
        if (!cancelled) {
          setConstellations(c);
          setError(null);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load constellations.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [regionId]);

  return { constellations, loading, error };
}
