import type { MarketOrder } from '../../api/catalog/types';
import { formatIsk, formatQty } from '../../lib/format';

/** One side of the book, rows already best-first (asks ascending, bids
 * descending). Shows a running cumulative quantity so depth is readable at
 * a glance. */
function BookSide({ title, orders, side }: { title: string; orders: MarketOrder[]; side: 'ask' | 'bid' }) {
  let cumulative = 0;
  const priceClass = side === 'ask' ? 'text-sell mono' : 'text-buy mono';
  return (
    <div style={{ minWidth: 0 }}>
      <div className="panel-header" style={{ marginBottom: 8 }}>
        <h4 className="panel-title" style={{ fontSize: 12 }}>
          {title}
        </h4>
        <span className="text-muted mono" style={{ fontSize: 11 }}>
          {orders.length} order{orders.length === 1 ? '' : 's'}
        </span>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table>
          <thead>
            <tr>
              <th>Price</th>
              <th>Qty</th>
              <th>Total</th>
              <th>Location</th>
            </tr>
          </thead>
          <tbody>
            {orders.length === 0 && (
              <tr>
                <td colSpan={4} className="text-muted">
                  No {side === 'ask' ? 'sell' : 'buy'} orders.
                </td>
              </tr>
            )}
            {orders.map((o) => {
              cumulative += o.volume_remain;
              return (
                <tr key={o.order_id}>
                  <td className={priceClass}>{formatIsk(o.price)}</td>
                  <td className="mono text-muted">{formatQty(o.volume_remain)}</td>
                  <td className="mono text-muted">{formatQty(cumulative)}</td>
                  <td className="text-muted" style={{ fontSize: 12 }}>
                    {o.system_name}
                    <span className="text-muted mono" style={{ fontSize: 10, marginLeft: 6 }}>
                      {o.region_name}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function OrderBook({
  asks,
  bids,
  loading,
  error,
}: {
  asks: MarketOrder[];
  bids: MarketOrder[];
  loading: boolean;
  error: string | null;
}) {
  const bestAsk = asks[0]?.price ?? null;
  const bestBid = bids[0]?.price ?? null;
  const spread = bestAsk !== null && bestBid !== null ? bestAsk - bestBid : null;
  const spreadPct = spread !== null && bestBid ? (spread / bestBid) * 100 : null;

  return (
    <div className="panel panel--tight">
      <div className="panel-header">
        <h3 className="panel-title">Order Book</h3>
        {loading && (
          <span className="text-muted mono" style={{ fontSize: 11 }}>
            Loading…
          </span>
        )}
      </div>

      {error && <p className="error-text">{error}</p>}

      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 16,
          alignItems: 'baseline',
          padding: '8px 0 14px',
          borderBottom: '1px solid var(--border-dim)',
          marginBottom: 14,
          fontSize: 13,
        }}
      >
        <span className="mono">
          Best bid: <span className="text-buy">{bestBid !== null ? formatIsk(bestBid) : '—'}</span>
        </span>
        <span className="mono">
          Best ask: <span className="text-sell">{bestAsk !== null ? formatIsk(bestAsk) : '—'}</span>
        </span>
        <span className="mono text-muted">
          Spread: {spread !== null ? formatIsk(spread) : '—'}
          {spreadPct !== null ? ` (${spreadPct.toFixed(2)}%)` : ''}
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 20 }}>
        <BookSide title="Sell orders (asks)" orders={asks} side="ask" />
        <BookSide title="Buy orders (bids)" orders={bids} side="bid" />
      </div>
    </div>
  );
}
