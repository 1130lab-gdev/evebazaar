import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { api, ApiError } from '../api/client';
import { setCatalogApiKey } from '../api/catalog/client';
import type { Order, SubmitOrderRequest, UserRole } from '../api/types';

const STORAGE_KEY = 'evebazaar.session';
const ORDER_POLL_INTERVAL_MS = 4000;

export type SessionStatus = 'signed_out' | 'verifying' | 'signed_in' | 'invalid';

interface StoredSession {
  username: string;
  apiKey: string;
  role: UserRole;
}

function loadSession(): StoredSession | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StoredSession;
  } catch {
    return null;
  }
}

interface AuthState {
  status: SessionStatus;
  apiKey: string | null;
  username: string | null;
  role: UserRole | null;
  orders: Order[];
  error: string | null;
  login: (username: string, apiKey: string) => Promise<void>;
  signOut: () => void;
  submitOrder: (req: SubmitOrderRequest) => Promise<Order>;
  cancelOrder: (id: number) => Promise<Order>;
  refreshOrders: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<StoredSession | null>(loadSession);
  const [status, setStatus] = useState<SessionStatus>(session ? 'signed_in' : 'signed_out');
  const [orders, setOrders] = useState<Order[]>([]);
  const [error, setError] = useState<string | null>(null);
  const sessionRef = useRef(session);
  sessionRef.current = session;

  useEffect(() => {
    setCatalogApiKey(session?.apiKey ?? null);
  }, [session]);

  const refreshOrders = useCallback(async () => {
    const key = sessionRef.current?.apiKey;
    if (!key) return;
    try {
      const list = await api.listOrders(key);
      setOrders(list);
      setError(null);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setStatus('invalid');
        setError('That session was rejected by the exchange -- please sign in again.');
        setSession(null);
        localStorage.removeItem(STORAGE_KEY);
      } else {
        // Transient/network failure, or a non-trader role hitting a route
        // it can't use -- keep the session and last-known orders either way.
        setError(err instanceof Error ? err.message : 'Failed to reach the exchange.');
      }
    }
  }, []);

  // /ws/orders can't be authenticated from a browser (it only accepts the
  // API key as an Authorization header, which the WebSocket handshake
  // can't set), so order state is kept fresh with REST polling instead of
  // a live socket. Only trader/admin accounts can call /orders at all, so
  // there's nothing to poll for any other role.
  useEffect(() => {
    if (!session || (session.role !== 'trader' && session.role !== 'admin')) return;
    void refreshOrders();
    const interval = setInterval(() => void refreshOrders(), ORDER_POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [session, refreshOrders]);

  const login = useCallback(async (username: string, apiKey: string) => {
    setStatus('verifying');
    setError(null);
    try {
      const me = await api.me(apiKey);
      if (me.username !== username) {
        throw new ApiError(401, 'That API key belongs to a different character.');
      }
      const next: StoredSession = { username: me.username, apiKey, role: me.role };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      setSession(next);
      setStatus('signed_in');
    } catch (err) {
      setStatus('invalid');
      setError(err instanceof ApiError ? err.message : 'Failed to reach the exchange.');
      throw err;
    }
  }, []);

  const signOut = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setSession(null);
    setOrders([]);
    setStatus('signed_out');
    setError(null);
  }, []);

  const submitOrder = useCallback(
    async (req: SubmitOrderRequest) => {
      const key = sessionRef.current?.apiKey;
      if (!key) throw new Error('Not signed in.');
      const order = await api.submitOrder(req, key);
      await refreshOrders();
      return order;
    },
    [refreshOrders],
  );

  const cancelOrder = useCallback(
    async (id: number) => {
      const key = sessionRef.current?.apiKey;
      if (!key) throw new Error('Not signed in.');
      const order = await api.cancelOrder(id, key);
      await refreshOrders();
      return order;
    },
    [refreshOrders],
  );

  const value = useMemo<AuthState>(
    () => ({
      status,
      apiKey: session?.apiKey ?? null,
      username: session?.username ?? null,
      role: session?.role ?? null,
      orders,
      error,
      login,
      signOut,
      submitOrder,
      cancelOrder,
      refreshOrders,
    }),
    [status, session, orders, error, login, signOut, submitOrder, cancelOrder, refreshOrders],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
