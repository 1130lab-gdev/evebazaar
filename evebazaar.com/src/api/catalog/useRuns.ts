import { useCallback, useEffect, useState } from 'react';
import { catalogDelete, catalogPatch, catalogPost, catalogRequest } from './client';
import type { CreateRunRequest, HaulerRun, RunStatus } from './types';

/** Runs for one hauler -- refetches whenever `haulerId` changes, and after
 * any mutation made through the returned functions. */
export function useRuns(haulerId: number | null): {
  runs: HaulerRun[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
  createRun: (req: CreateRunRequest) => Promise<HaulerRun>;
  updateRunStatus: (runId: number, status: RunStatus) => Promise<HaulerRun>;
  deleteRun: (runId: number) => Promise<void>;
  setLegCompleted: (runId: number, runLegId: number, completed: boolean) => Promise<void>;
} {
  const [runs, setRuns] = useState<HaulerRun[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (haulerId === null) {
      setRuns([]);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    catalogRequest<HaulerRun[]>(`/haulers/${haulerId}/runs`, controller.signal)
      .then((r) => {
        setRuns(r);
        setError(null);
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setError(err instanceof Error ? err.message : 'Failed to load runs.');
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [haulerId, version]);

  const refresh = useCallback(() => setVersion((v) => v + 1), []);

  const createRun = useCallback(
    async (req: CreateRunRequest) => {
      if (haulerId === null) throw new Error('createRun called without a hauler selected');
      const run = await catalogPost<HaulerRun>(`/haulers/${haulerId}/runs`, req);
      setVersion((v) => v + 1);
      return run;
    },
    [haulerId],
  );

  const updateRunStatus = useCallback(async (runId: number, status: RunStatus) => {
    const run = await catalogPatch<HaulerRun>(`/runs/${runId}`, { status });
    setVersion((v) => v + 1);
    return run;
  }, []);

  const deleteRun = useCallback(async (runId: number) => {
    await catalogDelete<void>(`/runs/${runId}`);
    setVersion((v) => v + 1);
  }, []);

  const setLegCompleted = useCallback(async (runId: number, runLegId: number, completed: boolean) => {
    await catalogPatch<void>(`/runs/${runId}/legs/${runLegId}`, { completed });
    setVersion((v) => v + 1);
  }, []);

  return { runs, loading, error, refresh, createRun, updateRunStatus, deleteRun, setLegCompleted };
}
