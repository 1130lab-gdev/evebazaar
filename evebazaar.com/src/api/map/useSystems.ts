import { useEffect, useState } from 'react';
import { buildQuery, mapRequest } from './client';
import type { SystemSummary } from './types';

// Keyed by "region_id:constellation_id" -- system lists don't change at
// runtime, so each distinct filter is fetched once and shared.
const cache = new Map<string, Promise<SystemSummary[]>>();

function loadSystems(regionId?: number, constellationId?: number): Promise<SystemSummary[]> {
  const key = `${regionId ?? ''}:${constellationId ?? ''}`;
  let entry = cache.get(key);
  if (!entry) {
    entry = mapRequest<SystemSummary[]>(`/systems${buildQuery({ region_id: regionId, constellation_id: constellationId })}`);
    cache.set(key, entry);
  }
  return entry;
}

export function useSystems(
  regionId?: number,
  constellationId?: number,
): { systems: SystemSummary[]; loading: boolean; error: string | null } {
  const [systems, setSystems] = useState<SystemSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    loadSystems(regionId, constellationId)
      .then((s) => {
        if (!cancelled) {
          setSystems(s);
          setError(null);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load systems.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [regionId, constellationId]);

  return { systems, loading, error };
}
