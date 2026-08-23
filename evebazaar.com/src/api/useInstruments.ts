import { useEffect, useState } from 'react';
import { api } from './client';
import type { Instrument } from './types';

export function useInstruments(): { instruments: Instrument[]; loading: boolean; error: string | null } {
  const [instruments, setInstruments] = useState<Instrument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .listInstruments()
      .then((list) => {
        if (!cancelled) {
          setInstruments(list);
          setError(null);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load instruments.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { instruments, loading, error };
}
