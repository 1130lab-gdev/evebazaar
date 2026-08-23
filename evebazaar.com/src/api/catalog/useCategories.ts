import { useEffect, useState } from 'react';
import { catalogRequest } from './client';
import type { Category } from './types';

// Categories essentially never change -- same caching approach as useRegions.
let cached: Promise<Category[]> | null = null;

function loadCategories(): Promise<Category[]> {
  if (!cached) cached = catalogRequest<Category[]>('/categories');
  return cached;
}

export function useCategories(): { categories: Category[]; loading: boolean; error: string | null } {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadCategories()
      .then((c) => {
        if (!cancelled) {
          setCategories(c);
          setError(null);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load categories.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { categories, loading, error };
}
