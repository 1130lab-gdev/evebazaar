import { useState } from 'react';
import { orderSideLabel, orderStatusLabel, isBuySide } from '../../lib/orderSide';
import { formatIsk, formatQty, formatTime } from '../../lib/format';
import { Panel } from '../ui/Panel';
import type { Order } from '../../api/types';

const CANCELLABLE: Order['order_status'][] = ['opening', 'open'];

export function BrokerOrdersPanel({
  orders,
  loading,
  error,
  traderNames,
  onCancel,
}: {
  orders: Order[];
  loading: boolean;
  error: string | null;
  /** username for a `user_id`, when this browser session created that trader -- `/broker/orders` doesn't return usernames. */
  traderNames: Map<number, string>;
  onCancel: (id: number) => Promise<Order>;
}) {
  const [cancellingId, setCancellingId] = useState<number | null>(null);

  const handleCancel = async (id: number) => {
    setCancellingId(id);
    try {
      await onCancel(id);
    } finally {
      setCancellingId(null);
    }
  };

  return (
    <Panel
      title="Your Traders' Orders"
      right={
        loading ? (
          <span className="mono text-muted" style={{ fontSize: 11 }}>
            Loading…
          </span>
        ) : undefined
      }
    >
      {error && <p className="error-text">{error}</p>}
      {!loading && orders.length === 0 ? (
        <p className="text-muted mono" style={{ fontSize: 13 }}>
          No orders yet from traders you've created.
        </p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Trader</th>
              <th>Side</th>
              <th>Price</th>
              <th>Qty</th>
              <th>Filled</th>
              <th>Status</th>
              <th>Updated</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {orders.map((order) => (
              <tr key={order.id}>
                <td className="mono">{order.id}</td>
                <td className="mono">{traderNames.get(order.user_id) ?? `user #${order.user_id}`}</td>
                <td className={isBuySide(order.order_side) ? 'text-buy mono' : 'text-sell mono'}>
                  {orderSideLabel(order.order_side)}
                </td>
                <td className="mono">{order.order_type === 'market' ? 'Market' : formatIsk(order.price)}</td>
                <td className="mono">{formatQty(order.quantity)}</td>
                <td className="mono text-muted">{formatQty(order.filled_quantity)}</td>
                <td className="mono">{orderStatusLabel(order.order_status)}</td>
                <td className="mono text-muted">{formatTime(order.updated_at)}</td>
                <td>
                  {CANCELLABLE.includes(order.order_status) && (
                    <button
                      className="btn btn--danger"
                      style={{ padding: '4px 10px', fontSize: 11 }}
                      disabled={cancellingId === order.id}
                      onClick={() => void handleCancel(order.id)}
                    >
                      {cancellingId === order.id ? '…' : 'Cancel'}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Panel>
  );
}
