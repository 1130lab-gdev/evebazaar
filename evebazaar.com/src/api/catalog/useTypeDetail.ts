import { useEffect, useState } from 'react';
import { catalogRequest } from './client';
import type { TypeDetail } from './types';

export function useTypeDetail(typeId: number | null): { type: TypeDetail | null; loading: boolean; error: string | null } {
  const [type, setType] = useState<TypeDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (typeId === null) {
      setType(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    catalogRequest<TypeDetail>(`/types/${typeId}`)
      .then((t) => {
        if (!cancelled) {
          setType(t);
          setError(null);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load item.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [typeId]);

  return { type, loading, error };
}
