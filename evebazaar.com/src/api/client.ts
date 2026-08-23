import type { ApiErrorBody, CreateTraderRequest, CreateTraderResponse, Instrument, Order, SubmitOrderRequest, User } from './types';

export const API_BASE_URL: string = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8080';

export const WS_BASE_URL: string = API_BASE_URL.replace(/^http/, 'ws');

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

async function request<T>(path: string, init: RequestInit = {}, apiKey?: string): Promise<T> {
  const headers = new Headers(init.headers);
  if (apiKey) headers.set('Authorization', `Bearer ${apiKey}`);
  if (init.body) headers.set('Content-Type', 'application/json');

  const res = await fetch(`${API_BASE_URL}${path}`, { ...init, headers });
  if (!res.ok) {
    let message = res.statusText;
    try {
      const body = (await res.json()) as ApiErrorBody;
      message = body.error ?? body.message ?? message;
    } catch {
      // response wasn't JSON; fall back to statusText
    }
    throw new ApiError(res.status, message);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  listInstruments: () => request<Instrument[]>('/instruments'),

  /** Verifies an API key and resolves the caller's identity + role -- the login form's one round trip. */
  me: (apiKey: string) => request<User>('/me', {}, apiKey),

  listOrders: (apiKey: string) => request<Order[]>('/orders', {}, apiKey),

  getOrder: (id: number, apiKey: string) => request<Order>(`/orders/${id}`, {}, apiKey),

  submitOrder: (req: SubmitOrderRequest, apiKey: string) =>
    request<Order>('/orders', { method: 'POST', body: JSON.stringify(req) }, apiKey),

  cancelOrder: (id: number, apiKey: string) =>
    request<Order>(`/orders/${id}`, { method: 'DELETE' }, apiKey),

  /** Broker-only: mints a trader account scoped to the caller (`created_by_broker_id`). */
  createTrader: (req: CreateTraderRequest, apiKey: string) =>
    request<CreateTraderResponse>('/broker/traders', { method: 'POST', body: JSON.stringify(req) }, apiKey),

  /** Broker-only: trader accounts the caller created -- resolves /broker/orders' bare user_id into a name. */
  listBrokerTraders: (apiKey: string) => request<User[]>('/broker/traders', {}, apiKey),

  /** Broker-only: orders belonging to trader accounts the caller created, never anyone else's. */
  listBrokerOrders: (apiKey: string) => request<Order[]>('/broker/orders', {}, apiKey),

  cancelBrokerOrder: (id: number, apiKey: string) =>
    request<Order>(`/broker/orders/${id}`, { method: 'DELETE' }, apiKey),
};
