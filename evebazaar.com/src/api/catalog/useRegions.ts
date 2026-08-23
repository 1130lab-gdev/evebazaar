import { useEffect, useState } from 'react';
import { catalogRequest } from './client';
import type { Region } from './types';

// Regions essentially never change -- fetch once per page load and share
// across every consumer instead of refetching per-component.
let cached: Promise<Region[]> | null = null;

function loadRegions(): Promise<Region[]> {
  if (!cached) cached = catalogRequest<Region[]>('/regions');
  return cached;
}

export function useRegions(): { regions: Region[]; loading: boolean; error: string | null } {
  const [regions, setRegions] = useState<Region[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadRegions()
      .then((r) => {
        if (!cancelled) {
          setRegions(r);
          setError(null);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load regions.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { regions, loading, error };
}
