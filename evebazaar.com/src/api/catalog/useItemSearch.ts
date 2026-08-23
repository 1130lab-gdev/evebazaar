import { useEffect, useState } from 'react';
import { catalogRequest } from './client';
import type { SearchResult } from './types';

const DEBOUNCE_MS = 250;

export function useItemSearch(query: string): { results: SearchResult[]; loading: boolean; error: string | null } {
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length === 0) {
      setResults([]);
      setLoading(false);
      setError(null);
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => {
      setLoading(true);
      catalogRequest<SearchResult[]>(`/search?q=${encodeURIComponent(trimmed)}`, controller.signal)
        .then((r) => {
          setResults(r);
          setError(null);
        })
        .catch((err: unknown) => {
          if (err instanceof DOMException && err.name === 'AbortError') return;
          setError(err instanceof Error ? err.message : 'Search failed.');
        })
        .finally(() => setLoading(false));
    }, DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  return { results, loading, error };
}
