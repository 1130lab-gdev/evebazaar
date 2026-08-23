import { useState } from 'react';
import { usePriceCheck } from '../../api/catalog/usePriceCheck';
import type { RoutePlan, RoutePlanLeg } from '../../api/catalog/types';
import { formatIsk, formatQty, formatSecStatus } from '../../lib/format';
import { securityColor } from '../../lib/securityColor';
import { ItemInfoIcon } from '../ui/ItemInfoIcon';
import { LiveCheckCell } from '../ui/LiveCheckCell';

/** Groups consecutive legs sharing one buy/sell system pair into a single
 * hop -- the branch-and-bound planner can load several different
 * profitable items onto one hop (see catalog-api's routes/route_planner.rs
 * `pack_hop`), and the table renders each hop's buy/sell/jumps info once,
 * spanning its item rows, rather than repeating it per item. */
function groupIntoHops(legs: RoutePlanLeg[]): { buySystemId: number; sellSystemId: number; items: RoutePlanLeg[] }[] {
  const hops: { buySystemId: number; sellSystemId: number; items: RoutePlanLeg[] }[] = [];
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

export function RoutePlanCard({
  plan,
  index,
  canSave,
  onSave,
  onViewOnMap,
}: {
  plan: RoutePlan;
  index: number;
  canSave: boolean;
  onSave: () => Promise<void>;
  onViewOnMap: (focus: { sourceSystemId: number; targetSystemId: number }) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      await onSave();
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save run.');
    } finally {
      setSaving(false);
    }
  }

  const hops = groupIntoHops(plan.legs);
  const avgHopProfit = hops.length > 0 ? plan.total_profit / hops.length : 0;
  const iskPerJump = plan.total_jumps && plan.total_jumps > 0 ? plan.total_profit / plan.total_jumps : null;
  const profitPct = plan.total_cost > 0 ? (plan.total_profit / plan.total_cost) * 100 : 0;
  const firstLeg = plan.legs[0];
  const lastLeg = plan.legs[plan.legs.length - 1];
  const isCircular = firstLeg !== undefined && lastLeg !== undefined && firstLeg.buy_system_id === lastLeg.sell_system_id;
  const { checks, loading: checking, error: checkError, checkPrices } = usePriceCheck();

  function refreshPrices() {
    void checkPrices(
      plan.legs.map((leg) => ({
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
          Route #{index + 1}
          <span className="text-muted" style={{ marginLeft: 10, fontSize: 11, textTransform: 'none', letterSpacing: 'normal' }}>
            {hops.length} hop{hops.length === 1 ? '' : 's'} · {plan.legs.length} item{plan.legs.length === 1 ? '' : 's'} ·{' '}
            {plan.total_jumps ?? '—'} jumps
            {isCircular && ' · circular ⟲'}
          </span>
        </h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {checkError && <span className="error-text">{checkError}</span>}
          {error && <span className="error-text">{error}</span>}
          <button className="btn" style={{ padding: '6px 10px', fontSize: 11 }} disabled={checking} onClick={refreshPrices}>
            {checking ? 'Checking…' : checks ? 'Recheck prices' : 'Check prices'}
          </button>
          <button className="btn btn--primary" style={{ padding: '6px 12px', fontSize: 11 }} disabled={!canSave || saving || saved} onClick={handleSave}>
            {saved ? 'Saved ✓' : saving ? 'Saving…' : 'Save as run'}
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
              <th>Leg profit</th>
              <th>Margin</th>
              <th>Live</th>
              <th>Jumps</th>
            </tr>
          </thead>
          <tbody>
            {hops.map((hop, hopIndex) =>
              hop.items.map((leg, itemIndex) => (
                <tr key={`${hopIndex}-${itemIndex}`}>
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
                      <span className="mono" style={{ color: securityColor(leg.buy_security_status), marginLeft: 6 }}>
                        {formatSecStatus(leg.buy_security_status)}
                      </span>
                    </td>
                  )}
                  <td className="mono text-muted">{formatIsk(leg.buy_price)}</td>
                  {itemIndex === 0 && (
                    <td className="text-muted" rowSpan={hop.items.length}>
                      {leg.sell_system_name}
                      <span className="mono" style={{ color: securityColor(leg.sell_security_status), marginLeft: 6 }}>
                        {formatSecStatus(leg.sell_security_status)}
                      </span>
                    </td>
                  )}
                  <td className="mono text-muted">{formatIsk(leg.sell_price)}</td>
                  <td className="mono text-muted">{formatQty(leg.quantity)}</td>
                  <td className="mono text-buy">{formatIsk(leg.leg_profit)}</td>
                  <td className="mono text-buy">{leg.profit_pct.toFixed(1)}%</td>
                  <td className="mono" style={{ fontSize: 11 }}>
                    <LiveCheckCell check={checks?.[plan.legs.indexOf(leg)] ?? null} />
                  </td>
                  {itemIndex === 0 && (
                    <td className="mono text-muted" rowSpan={hop.items.length}>
                      {leg.jumps ?? '—'}
                    </td>
                  )}
                </tr>
              )),
            )}
          </tbody>
        </table>
      </div>

      <div style={{ display: 'flex', gap: 24, marginTop: 12, flexWrap: 'wrap' }}>
        <p className="mono" style={{ margin: 0, fontSize: 13 }}>
          Total cost: <span className="text-muted">{formatIsk(plan.total_cost)}</span>
        </p>
        <p className="mono text-buy" style={{ margin: 0, fontSize: 13 }}>
          Total profit: {formatIsk(plan.total_profit)} ({profitPct.toFixed(1)}%)
        </p>
        <p className="mono text-muted" style={{ margin: 0, fontSize: 13 }}>
          Avg hop profit: {formatIsk(avgHopProfit)}
        </p>
        <p className="mono text-muted" style={{ margin: 0, fontSize: 13 }}>
          ISK/jump: {iskPerJump !== null ? formatIsk(iskPerJump) : '—'}
        </p>
      </div>
    </div>
  );
}
