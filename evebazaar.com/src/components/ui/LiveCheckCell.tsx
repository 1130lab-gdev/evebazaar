import type { LegPriceCheck } from '../../api/catalog/types';
import { formatIsk } from '../../lib/format';

/** Renders one leg's `LegPriceCheck` result -- shared by RunCard and
 * RoutePlanCard, which both check the same shape of leg against the same
 * `/price-checks` endpoint. `null` means "not checked yet" (the button
 * hasn't been clicked), distinct from a checked-but-gone leg. */
export function LiveCheckCell({ check }: { check: LegPriceCheck | null }) {
  if (check === null) return <span style={{ color: 'var(--text-faint)' }}>not checked</span>;
  if (!check.still_viable) {
    return (
      <span className="error-text">
        {check.current_buy_price === null || check.current_sell_price === null ? '✗ order gone' : '✗ no longer worth it'}
      </span>
    );
  }
  return <span className="text-buy">✓ {formatIsk(check.current_profit_per_unit ?? 0)}/unit</span>;
}
