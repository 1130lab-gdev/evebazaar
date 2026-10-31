import { useCallback, useRef, useState } from 'react';
import { catalogRequest } from './client';
import type { RoutePlan, RoutePlannerParams } from './types';

export const defaultRoutePlannerParams: RoutePlannerParams = {
  cargoCapacityM3: null,
  iskAvailable: null,
  startSystemId: null,
  targetSystemId: null,
  maxLegs: null,
  securityProfile: 'high_sec_only',
  salesTaxPct: null,
  returnToStart: false,
  nameQuery: '',
  categoryIds: [],
  marketGroupIds: [],
  minBuyPrice: null,
  maxBuyPrice: null,
  minSellPrice: null,
  maxSellPrice: null,
  minProfit: null,
  minProfitPct: null,
  minVolume: null,
  maxTotalCost: null,
  excludeSystemIds: [],
  buySecurityClasses: [],
  sellSecurityClasses: [],
  excludeIllegal: false,
};

function buildQuery(params: RoutePlannerParams): string {
  const q = new URLSearchParams();
  if (params.cargoCapacityM3 !== null) q.set('cargo_capacity_m3', String(params.cargoCapacityM3));
  if (params.iskAvailable !== null) q.set('isk_available', String(params.iskAvailable));
  if (params.startSystemId !== null) q.set('start_system_id', String(params.startSystemId));
  if (params.targetSystemId !== null) q.set('target_system_id', String(params.targetSystemId));
  if (params.maxLegs !== null) q.set('max_legs', String(params.maxLegs));
  if (params.securityProfile) q.set('security_profile', params.securityProfile);
  if (params.salesTaxPct !== null) q.set('sales_tax_pct', String(params.salesTaxPct));
  if (params.returnToStart) q.set('return_to_start', 'true');
  if (params.nameQuery.trim()) q.set('q', params.nameQuery.trim());
  for (const id of params.categoryIds) q.append('category_id', String(id));
  for (const id of params.marketGroupIds) q.append('market_group_id', String(id));
  if (params.minBuyPrice !== null) q.set('min_buy_price', String(params.minBuyPrice));
  if (params.maxBuyPrice !== null) q.set('max_buy_price', String(params.maxBuyPrice));
  if (params.minSellPrice !== null) q.set('min_sell_price', String(params.minSellPrice));
  if (params.maxSellPrice !== null) q.set('max_sell_price', String(params.maxSellPrice));
  if (params.minProfit !== null) q.set('min_profit', String(params.minProfit));
  if (params.minProfitPct !== null) q.set('min_profit_pct', String(params.minProfitPct));
  if (params.minVolume !== null) q.set('min_volume', String(params.minVolume));
  if (params.maxTotalCost !== null) q.set('max_total_cost', String(params.maxTotalCost));
  for (const id of params.excludeSystemIds) q.append('exclude_system_id', String(id));
  for (const cls of params.buySecurityClasses) q.append('buy_security_class', cls);
  for (const cls of params.sellSecurityClasses) q.append('sell_security_class', cls);
  if (params.excludeIllegal) q.set('exclude_illegal', 'true');
  return q.toString();
}

/**
 * Unlike useArbitrage/useOrderBook, this does NOT auto-refetch as params
 * change -- a plan is a branch-and-bound search over the market (see
 * catalog-api's routes/route_planner.rs) that can still run to a handful of
 * seconds at the clamped worst case (6 legs), so it's a deliberate `plan()`
 * call triggered by a button press, not something to run on every keystroke
 * of a settings form.
 */
export function useRoutePlanner(): {
  plans: RoutePlan[];
  loading: boolean;
  error: string | null;
  plan: (params: RoutePlannerParams) => void;
  reset: () => void;
} {
  const [plans, setPlans] = useState<RoutePlan[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);

  const plan = useCallback((params: RoutePlannerParams) => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;

    setLoading(true);
    setError(null);
    catalogRequest<RoutePlan[]>(`/route-planner?${buildQuery(params)}`, controller.signal)
      .then((p) => {
        setPlans(p);
        setError(null);
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setError(err instanceof Error ? err.message : 'Failed to plan route.');
      })
      .finally(() => setLoading(false));
  }, []);

  const reset = useCallback(() => {
    controllerRef.current?.abort();
    setPlans([]);
    setError(null);
    setLoading(false);
  }, []);

  return { plans, loading, error, plan, reset };
}
