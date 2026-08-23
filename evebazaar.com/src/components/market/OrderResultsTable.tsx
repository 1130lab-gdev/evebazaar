import type { MarketOrder } from '../../api/catalog/types';
import { formatDateTime, formatIsk, formatQty } from '../../lib/format';
import { ORDERS_PAGE_SIZE } from '../../api/catalog/useMarketOrders';

export function OrderResultsTable({
  orders,
  loading,
  page,
  onPageChange,
}: {
  orders: MarketOrder[];
  loading: boolean;
  page: number;
  onPageChange: (page: number) => void;
}) {
  return (
    <div className="panel panel--tight">
      <div className="panel-header">
        <h3 className="panel-title">Market Orders</h3>
        {loading && (
          <span className="text-muted mono" style={{ fontSize: 11 }}>
            Loading…
          </span>
        )}
      </div>

      <table>
        <thead>
          <tr>
            <th>Side</th>
            <th>Price</th>
            <th>Qty</th>
            <th>Region</th>
            <th>System</th>
            <th>Station</th>
            <th>Range</th>
            <th>Issued</th>
          </tr>
        </thead>
        <tbody>
          {!loading && orders.length === 0 && (
            <tr>
              <td colSpan={8} className="text-muted">
                No orders match the current filters.
              </td>
            </tr>
          )}
          {orders.map((o) => (
            <tr key={o.order_id}>
              <td className={o.is_buy_order ? 'text-buy mono' : 'text-sell mono'}>{o.is_buy_order ? 'Buy' : 'Sell'}</td>
              <td className="mono">{formatIsk(o.price)}</td>
              <td className="mono text-muted">
                {formatQty(o.volume_remain)} / {formatQty(o.volume_total)}
              </td>
              <td className="text-muted">{o.region_name}</td>
              <td className="text-muted">{o.system_name}</td>
              <td className="text-muted">{o.station_name ?? '—'}</td>
              <td className="text-muted mono">{o.range}</td>
              <td className="text-muted mono">{formatDateTime(o.issued)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
        <button className="btn" disabled={page === 0} onClick={() => onPageChange(page - 1)}>
          Prev
        </button>
        <button className="btn" disabled={orders.length < ORDERS_PAGE_SIZE} onClick={() => onPageChange(page + 1)}>
          Next
        </button>
      </div>
    </div>
  );
}
