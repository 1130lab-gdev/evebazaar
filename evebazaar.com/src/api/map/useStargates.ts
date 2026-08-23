import { useEffect, useState } from 'react';
import { buildQuery, mapRequest } from './client';
import type { Stargate } from './types';

export interface StargateFilter {
  regionId?: number;
  constellationId?: number;
  systemId?: number;
}

// Keyed by the filter combination -- the jump graph is static at runtime.
const cache = new Map<string, Promise<Stargate[]>>();

function loadStargates(filter: StargateFilter): Promise<Stargate[]> {
  const key = `${filter.regionId ?? ''}:${filter.constellationId ?? ''}:${filter.systemId ?? ''}`;
  let entry = cache.get(key);
  if (!entry) {
    entry = mapRequest<Stargate[]>(
      `/stargates${buildQuery({ region_id: filter.regionId, constellation_id: filter.constellationId, system_id: filter.systemId })}`,
    );
    cache.set(key, entry);
  }
  return entry;
}

export function useStargates(filter: StargateFilter): { stargates: Stargate[]; loading: boolean; error: string | null } {
  const { regionId, constellationId, systemId } = filter;
  const [stargates, setStargates] = useState<Stargate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    loadStargates({ regionId, constellationId, systemId })
      .then((s) => {
        if (!cancelled) {
          setStargates(s);
          setError(null);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load stargates.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [regionId, constellationId, systemId]);

  return { stargates, loading, error };
}
