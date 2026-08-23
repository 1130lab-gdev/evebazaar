import type { ApiErrorBody } from './types';

export const MAP_API_BASE_URL: string = import.meta.env.VITE_MAP_API_BASE_URL ?? 'http://localhost:8092';

export class MapApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'MapApiError';
    this.status = status;
  }
}

export async function mapRequest<T>(path: string, signal?: AbortSignal): Promise<T> {
  const started = performance.now();
  const res = await fetch(`${MAP_API_BASE_URL}${path}`, { signal });
  const elapsedMs = performance.now() - started;

  if (!res.ok) {
    let message = res.statusText;
    try {
      const body = (await res.json()) as ApiErrorBody;
      message = body.error ?? body.message ?? message;
    } catch {
      // response wasn't JSON; fall back to statusText
    }
    throw new MapApiError(res.status, message);
  }

  const json = (await res.json()) as T;
  // Stashed on the response for the Explorer tab's latency readout; hooks
  // that just want the data can ignore it.
  requestTimings.set(path, elapsedMs);
  return json;
}

/** Latest observed latency per request path, read by the Explorer tab. */
export const requestTimings = new Map<string, number>();

export interface RawResponse {
  status: number;
  ok: boolean;
  elapsedMs: number;
  body: unknown;
}

/**
 * Like `mapRequest`, but never throws on a non-2xx status -- it returns the
 * status and whatever body came back so the Explorer tab can show exactly
 * what the API sent, error responses included. Network-level failures
 * (DNS, connection refused) still throw from `fetch` itself.
 */
export async function mapRequestRaw(path: string, signal?: AbortSignal): Promise<RawResponse> {
  const started = performance.now();
  const res = await fetch(`${MAP_API_BASE_URL}${path}`, { signal });
  const elapsedMs = performance.now() - started;

  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    // no/non-JSON body
  }

  requestTimings.set(path, elapsedMs);
  return { status: res.status, ok: res.ok, elapsedMs, body };
}

type QueryValue = string | number | boolean | number[] | string[] | undefined;

export function buildQuery(params: Record<string, QueryValue>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const item of value) search.append(key, String(item));
    } else {
      search.set(key, String(value));
    }
  }
  const qs = search.toString();
  return qs ? `?${qs}` : '';
}
