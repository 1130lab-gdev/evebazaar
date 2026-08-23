import { useEffect, useState } from 'react';
import { buildQuery, mapRequest } from './client';
import type { RouteParams, RouteResponse } from './types';

/**
 * Computes a route on demand. Pass `null` when the sandbox doesn't yet have
 * both a source and target picked -- no request is made until then. Not
 * cached: this is the parameter space the sandbox exists to poke at
 * (profiles, multipliers, warp speed), so every change should hit the API.
 */
export function useRoute(params: RouteParams | null): { route: RouteResponse | null; loading: boolean; error: string | null } {
  const [route, setRoute] = useState<RouteResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { source_system_id, target_system_id, warp_speed_au_s, profile, highsec_mult, lowsec_mult, nullsec_mult, avoid_system_id } =
    params ?? {};
  // Stable dependency for the effect below: an array's object identity
  // changes every render even when its contents don't, which would refetch
  // on every unrelated re-render if used directly in the dependency array.
  const avoidKey = avoid_system_id?.join(',') ?? '';

  useEffect(() => {
    if (params == null) {
      setRoute(null);
      setLoading(false);
      setError(null);
      return;
    }
    let cancelled = false;
    const controller = new AbortController();
    setLoading(true);
    mapRequest<RouteResponse>(
      `/route${buildQuery({
        source_system_id,
        target_system_id,
        warp_speed_au_s,
        profile,
        highsec_mult,
        lowsec_mult,
        nullsec_mult,
        avoid_system_id,
      })}`,
      controller.signal,
    )
      .then((r) => {
        if (!cancelled) {
          setRoute(r);
          setError(null);
        }
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setRoute(null);
        setError(err instanceof Error ? err.message : 'Failed to compute route.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [source_system_id, target_system_id, warp_speed_au_s, profile, highsec_mult, lowsec_mult, nullsec_mult, avoidKey]);

  return { route, loading, error };
}
