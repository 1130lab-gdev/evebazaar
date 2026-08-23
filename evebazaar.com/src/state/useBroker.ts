import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../api/client';
import { useAuth } from './AuthContext';
import type { CreateTraderResponse, Order, User } from '../api/types';

/**
 * Broker-scoped order management: `/broker/orders`/`/broker/traders` only
 * ever return trader accounts this broker personally created (enforced
 * server-side via `created_by_broker_id`), so there's no client-side
 * filtering to do here -- unlike AuthContext's trader-facing order state,
 * this doesn't poll (a broker reviewing their book doesn't need
 * sub-second freshness the way an active trader's order ticket does).
 */
export function useBroker(): {
  orders: Order[];
  traders: User[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  createTrader: (username: string) => Promise<CreateTraderResponse>;
  cancelOrder: (id: number) => Promise<Order>;
} {
  const { apiKey } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [traders, setTraders] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!apiKey) return;
    setLoading(true);
    try {
      const [orderList, traderList] = await Promise.all([api.listBrokerOrders(apiKey), api.listBrokerTraders(apiKey)]);
      setOrders(orderList);
      setTraders(traderList);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load your book.');
    } finally {
      setLoading(false);
    }
  }, [apiKey]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const createTrader = useCallback(
    async (username: string) => {
      if (!apiKey) throw new Error('Not signed in.');
      const trader = await api.createTrader({ username }, apiKey);
      await refresh();
      return trader;
    },
    [apiKey, refresh],
  );

  const cancelOrder = useCallback(
    async (id: number) => {
      if (!apiKey) throw new Error('Not signed in.');
      const order = await api.cancelBrokerOrder(id, apiKey);
      await refresh();
      return order;
    },
    [apiKey, refresh],
  );

  return { orders, traders, loading, error, refresh, createTrader, cancelOrder };
}
