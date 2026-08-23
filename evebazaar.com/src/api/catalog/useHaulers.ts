import { useCallback, useEffect, useState } from 'react';
import { catalogDelete, catalogPost, catalogPut, catalogRequest } from './client';
import type { Hauler, HaulerRequest } from './types';

export function useHaulers(): {
  haulers: Hauler[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
  createHauler: (req: HaulerRequest) => Promise<Hauler>;
  updateHauler: (haulerId: number, req: HaulerRequest) => Promise<Hauler>;
  deleteHauler: (haulerId: number) => Promise<void>;
} {
  const [haulers, setHaulers] = useState<Hauler[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    catalogRequest<Hauler[]>('/haulers', controller.signal)
      .then((h) => {
        setHaulers(h);
        setError(null);
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setError(err instanceof Error ? err.message : 'Failed to load haulers.');
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [version]);

  const refresh = useCallback(() => setVersion((v) => v + 1), []);

  const createHauler = useCallback(async (req: HaulerRequest) => {
    const hauler = await catalogPost<Hauler>('/haulers', req);
    setVersion((v) => v + 1);
    return hauler;
  }, []);

  const updateHauler = useCallback(async (haulerId: number, req: HaulerRequest) => {
    const hauler = await catalogPut<Hauler>(`/haulers/${haulerId}`, req);
    setVersion((v) => v + 1);
    return hauler;
  }, []);

  const deleteHauler = useCallback(async (haulerId: number) => {
    await catalogDelete<void>(`/haulers/${haulerId}`);
    setVersion((v) => v + 1);
  }, []);

  return { haulers, loading, error, refresh, createHauler, updateHauler, deleteHauler };
}
