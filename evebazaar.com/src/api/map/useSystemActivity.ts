import { useEffect, useState } from 'react';
import { buildQuery, mapRequest } from './client';
import type { SystemActivity } from './types';

export interface ActivityFilter {
  regionId?: number;
  constellationId?: number;
  systemId?: number;
}

/**
 * Kills/jumps in the last hour. Deliberately not cached like the taxonomy
 * hooks above -- this is live data, and every consumer should see a fresh
 * value each time its filter changes.
 */
export function useSystemActivity(filter: ActivityFilter): {
  activity: SystemActivity[];
  loading: boolean;
  error: string | null;
} {
  const { regionId, constellationId, systemId } = filter;
  const [activity, setActivity] = useState<SystemActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    mapRequest<SystemActivity[]>(
      `/system-activity${buildQuery({ region_id: regionId, constellation_id: constellationId, system_id: systemId })}`,
    )
      .then((a) => {
        if (!cancelled) {
          setActivity(a);
          setError(null);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load system activity.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [regionId, constellationId, systemId]);

  return { activity, loading, error };
}
