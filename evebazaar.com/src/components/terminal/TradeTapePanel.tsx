import type { Execution } from '../../api/useMarketFeed';
import { formatIsk, formatQty, formatClockTime } from '../../lib/format';

export function TradeTapePanel({ executions }: { executions: Execution[] }) {
  let lastPrice: number | null = null;

  return (
    <div className="panel panel--tight">
      <div className="panel-header">
        <h3 className="panel-title">Trade Tape</h3>
      </div>
      {executions.length === 0 && (
        <p className="text-muted mono" style={{ fontSize: 13 }}>
          No executions yet for this instrument.
        </p>
      )}
      <div style={{ maxHeight: 280, overflowY: 'auto' }}>
        {executions.map((exec) => {
          const direction = lastPrice === null ? 'flat' : exec.price > lastPrice ? 'up' : exec.price < lastPrice ? 'down' : 'flat';
          lastPrice = exec.price;
          const color =
            direction === 'up' ? 'var(--accent-green)' : direction === 'down' ? 'var(--accent-red)' : 'var(--text-primary)';
          return (
            <div
              key={`${exec.id}-${exec.receivedAt}`}
              className="mono"
              style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 8px', fontSize: 12.5 }}
            >
              <span className="text-muted">{formatClockTime(exec.receivedAt)}</span>
              <span style={{ color }}>{formatIsk(exec.price)}</span>
              <span className="text-muted">{formatQty(exec.quantity)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
