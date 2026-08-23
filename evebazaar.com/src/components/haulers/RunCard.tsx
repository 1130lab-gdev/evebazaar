import { usePriceCheck } from '../../api/catalog/usePriceCheck';
import type { HaulerRun, HaulerRunLeg, RunStatus } from '../../api/catalog/types';
import { formatIsk, formatQty, formatDateTime } from '../../lib/format';
import { ItemInfoIcon } from '../ui/ItemInfoIcon';
import { LiveCheckCell } from '../ui/LiveCheckCell';

const STATUSES: RunStatus[] = ['planned', 'in_progress', 'completed', 'abandoned'];

/** Groups consecutive legs sharing one buy/sell system pair into a single
 * hop -- a run built from the route planner can have several different
 * items bought at the same stop to sell at the next one (see catalog-api's
 * routes/route_planner.rs `pack_hop`), each saved as its own
 * `HaulerRunLeg` row via `leg_order`, but they're still one hop, not one
 * hop per item. Same grouping as RoutePlanCard.tsx's `groupIntoHops`. */
function groupIntoHops(legs: HaulerRunLeg[]): { buySystemId: number; sellSystemId: number; items: HaulerRunLeg[] }[] {
  const hops: { buySystemId: number; sellSystemId: number; items: HaulerRunLeg[] }[] = [];
  for (const leg of legs) {
    const current = hops[hops.length - 1];
    if (current && current.buySystemId === leg.buy_system_id && current.sellSystemId === leg.sell_system_id) {
      current.items.push(leg);
    } else {
      hops.push({ buySystemId: leg.buy_system_id, sellSystemId: leg.sell_system_id, items: [leg] });
    }
  }
  return hops;
}

export function RunCard({
  run,
  onStatusChange,
  onDelete,
  onLegCompletedChange,
  onViewOnMap,
}: {
  run: HaulerRun;
  onStatusChange: (status: RunStatus) => void;
  onDelete: () => void;
  onLegCompletedChange: (runLegId: number, completed: boolean) => void;
  onViewOnMap: (focus: { sourceSystemId: number; targetSystemId: number }) => void;
}) {
  const totalProfit = run.legs.reduce((sum, l) => sum + l.expected_profit, 0);
  const hops = groupIntoHops(run.legs);
  const { checks, loading: checking, error: checkError, checkPrices } = usePriceCheck();

  function refreshPrices() {
    void checkPrices(
      run.legs.map((leg) => ({
        type_id: leg.type_id,
        buy_system_id: leg.buy_system_id,
        sell_system_id: leg.sell_system_id,
        quantity: leg.quantity,
      })),
    );
  }

  return (
    <div className="panel panel--tight" style={{ marginBottom: 12 }}>
      <div className="panel-header">
        <h3 className="panel-title">
          {run.name ?? `Run #${run.run_id}`}
          <span className="text-muted" style={{ marginLeft: 10, fontSize: 11, textTransform: 'none', letterSpacing: 'normal' }}>
            {hops.length} hop{hops.length === 1 ? '' : 's'} · {run.legs.length} item{run.legs.length === 1 ? '' : 's'} · saved{' '}
            {formatDateTime(run.created_at)}
          </span>
        </h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {checkError && <span className="error-text">{checkError}</span>}
          <button className="btn" style={{ padding: '6px 10px', fontSize: 11 }} disabled={checking} onClick={refreshPrices}>
            {checking ? 'Checking…' : checks ? 'Recheck prices' : 'Check prices'}
          </button>
          <select value={run.status} onChange={(e) => onStatusChange(e.target.value as RunStatus)} style={{ width: 'auto' }}>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <button className="btn btn--danger" style={{ padding: '6px 10px', fontSize: 11 }} onClick={onDelete}>
            Delete
          </button>
        </div>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table>
          <thead>
            <tr>
              <th>Hop</th>
              <th>Item</th>
              <th>Buy at</th>
              <th>Buy price</th>
              <th>Sell at</th>
              <th>Sell price</th>
              <th>Qty</th>
              <th>Expected profit</th>
              <th>Live</th>
              <th>Done</th>
            </tr>
          </thead>
          <tbody>
            {hops.map((hop, hopIndex) =>
              hop.items.map((leg, itemIndex) => (
                <tr key={leg.run_leg_id}>
                  {itemIndex === 0 && (
                    <td className="mono text-muted" rowSpan={hop.items.length}>
                      {hopIndex + 1}
                      <button
                        type="button"
                        className="btn"
                        style={{ display: 'block', marginTop: 4, padding: '2px 6px', fontSize: 9, textTransform: 'none' }}
                        onClick={() => onViewOnMap({ sourceSystemId: hop.buySystemId, targetSystemId: hop.sellSystemId })}
                      >
                        Map
                      </button>
                    </td>
                  )}
                  <td>
                    {leg.type_name}
                    <ItemInfoIcon typeId={leg.type_id} typeName={leg.type_name} />
                  </td>
                  {itemIndex === 0 && (
                    <td className="text-muted" rowSpan={hop.items.length}>
                      {leg.buy_system_name}
                    </td>
                  )}
                  <td className="mono text-muted">{formatIsk(leg.buy_price)}</td>
                  {itemIndex === 0 && (
                    <td className="text-muted" rowSpan={hop.items.length}>
                      {leg.sell_system_name}
                    </td>
                  )}
                  <td className="mono text-muted">{formatIsk(leg.sell_price)}</td>
                  <td className="mono text-muted">{formatQty(leg.quantity)}</td>
                  <td className="mono text-buy">{formatIsk(leg.expected_profit)}</td>
                  <td className="mono" style={{ fontSize: 11 }}>
                    <LiveCheckCell check={checks?.[run.legs.indexOf(leg)] ?? null} />
                  </td>
                  <td>
                    <input
                      type="checkbox"
                      style={{ width: 'auto' }}
                      checked={leg.completed}
                      onChange={(e) => onLegCompletedChange(leg.run_leg_id, e.target.checked)}
                    />
                  </td>
                </tr>
              )),
            )}
          </tbody>
        </table>
      </div>

      <p className="mono text-buy" style={{ margin: '12px 0 0', fontSize: 13 }}>
        Total expected profit: {formatIsk(totalProfit)}
      </p>
    </div>
  );
}
