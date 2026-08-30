import type { ApiErrorBody } from '../types';

export const CATALOG_API_BASE_URL: string = import.meta.env.VITE_CATALOG_API_BASE_URL ?? 'http://localhost:8091';

export class CatalogApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'CatalogApiError';
    this.status = status;
  }
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let message = res.statusText;
    try {
      const body = (await res.json()) as ApiErrorBody;
      message = body.error ?? body.message ?? message;
    } catch {
      // response wasn't JSON; fall back to statusText
    }
    throw new CatalogApiError(res.status, message);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

// catalog-api is fully public -- no auth header on any route.
export async function catalogRequest<T>(path: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(`${CATALOG_API_BASE_URL}${path}`, { signal });
  return handleResponse<T>(res);
}

function catalogMutate<T>(method: 'POST' | 'PUT' | 'PATCH' | 'DELETE', path: string, body?: unknown): Promise<T> {
  return fetch(`${CATALOG_API_BASE_URL}${path}`, {
    method,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  }).then((res) => handleResponse<T>(res));
}

export const catalogPost = <T>(path: string, body: unknown) => catalogMutate<T>('POST', path, body);
export const catalogPut = <T>(path: string, body: unknown) => catalogMutate<T>('PUT', path, body);
export const catalogPatch = <T>(path: string, body: unknown) => catalogMutate<T>('PATCH', path, body);
export const catalogDelete = <T>(path: string) => catalogMutate<T>('DELETE', path);
