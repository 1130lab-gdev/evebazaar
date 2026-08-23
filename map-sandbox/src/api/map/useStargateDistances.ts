import { useEffect, useState } from 'react';
import { mapRequest } from './client';
import type { StargateDistance } from './types';

/** Pairwise in-system stargate distances. Not cached -- cheap per-system query, fetched on demand. */
export function useStargateDistances(systemId: number | undefined): {
  distances: StargateDistance[];
  loading: boolean;
  error: string | null;
} {
  const [distances, setDistances] = useState<StargateDistance[]>([]);
  const [loading, setLoading] = useState(systemId != null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (systemId == null) {
      setDistances([]);
      setLoading(false);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    mapRequest<StargateDistance[]>(`/systems/${systemId}/stargate-distances`)
      .then((d) => {
        if (!cancelled) {
          setDistances(d);
          setError(null);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load stargate distances.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [systemId]);

  return { distances, loading, error };
}
