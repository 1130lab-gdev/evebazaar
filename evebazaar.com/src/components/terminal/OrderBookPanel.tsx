import type { CSSProperties } from 'react';
import type { BookLevel, MarketEvent } from '../../api/types';
import { formatIsk, formatQty } from '../../lib/format';
import { StatusPill } from '../ui/StatusPill';
import type { ConnectionStatus } from '../../api/useMarketFeed';

const DEPTH_ROWS = 8;

function DepthRow({ level, max, side }: { level: BookLevel; max: number; side: 'bid' | 'ask' }) {
  const pct = max > 0 ? Math.round((level.quantity / max) * 100) : 0;
  return (
    <div
      className="mono"
      style={{
        position: 'relative',
        display: 'flex',
        justifyContent: 'space-between',
        padding: '3px 8px',
        fontSize: 13,
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          [side === 'bid' ? 'right' : 'left']: 0,
          width: `${pct}%`,
          background: side === 'bid' ? 'rgba(57, 255, 201, 0.12)' : 'rgba(255, 77, 109, 0.12)',
        } as CSSProperties}
      />
      <span style={{ position: 'relative', color: side === 'bid' ? 'var(--accent-green)' : 'var(--accent-red)' }}>
        {formatIsk(level.price)}
      </span>
      <span style={{ position: 'relative', color: 'var(--text-muted)' }}>{formatQty(level.quantity)}</span>
    </div>
  );
}

export function OrderBookPanel({
  book,
  status,
}: {
  book: MarketEvent | undefined;
  status: ConnectionStatus;
}) {
  const bids = (book?.bids ?? []).slice(0, DEPTH_ROWS);
  const asks = (book?.asks ?? []).slice(0, DEPTH_ROWS).slice().reverse();
  const maxQty = Math.max(1, ...bids.map((b) => b.quantity), ...asks.map((a) => a.quantity));
  const bestBid = book?.bids[0];
  const bestAsk = book?.asks[0];
  const spread = bestBid && bestAsk ? bestAsk.price - bestBid.price : null;

  return (
    <div className="panel panel--tight">
      <div className="panel-header">
        <h3 className="panel-title">Order Book</h3>
        <StatusPill status={status} />
      </div>

      {!book && <p className="text-muted mono" style={{ fontSize: 13 }}>No book snapshot yet for this instrument.</p>}

      {book && (
        <>
          <div>
            {asks.length === 0 && <p className="text-muted mono" style={{ fontSize: 12, padding: '3px 8px' }}>No asks</p>}
            {asks.map((lvl, i) => (
              <DepthRow key={`ask-${i}`} level={lvl} max={maxQty} side="ask" />
            ))}
          </div>

          <div
            className="mono"
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              padding: '8px 8px',
              margin: '4px 0',
              borderTop: '1px solid var(--border-dim)',
              borderBottom: '1px solid var(--border-dim)',
              fontSize: 12,
              color: 'var(--text-muted)',
            }}
          >
            <span>Spread</span>
            <span>{spread !== null ? formatIsk(spread) : '—'}</span>
          </div>

          <div>
            {bids.length === 0 && <p className="text-muted mono" style={{ fontSize: 12, padding: '3px 8px' }}>No bids</p>}
            {bids.map((lvl, i) => (
              <DepthRow key={`bid-${i}`} level={lvl} max={maxQty} side="bid" />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
