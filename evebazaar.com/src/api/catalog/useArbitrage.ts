import { useEffect, useState } from 'react';
import { catalogRequest } from './client';
import type { ArbitrageFilters, ArbitrageOpportunity } from './types';

export const ARBITRAGE_PAGE_SIZE = 50;

export const defaultArbitrageFilters: ArbitrageFilters = {
  nameQuery: '',
  categoryIds: [],
  marketGroupIds: [],
  includeBuySystemIds: [],
  includeSellSystemIds: [],
  excludeSystemIds: [],
  buySecurityClasses: [],
  sellSecurityClasses: [],
  minBuyPrice: null,
  maxBuyPrice: null,
  minSellPrice: null,
  maxSellPrice: null,
  minProfit: null,
  minProfitPct: null,
  minVolume: null,
  maxTotalCost: null,
  cargoCapacityM3: null,
  fromSystemId: null,
  maxJumpsFromLocation: null,
  securityProfile: '',
  salesTaxPct: 7.5,
  requireBidExceedsOffer: true,
  sortBy: 'profit',
  sortDesc: true,
};

function buildQuery(filters: ArbitrageFilters, page: number): string {
  const params = new URLSearchParams();
  if (filters.nameQuery.trim()) params.set('q', filters.nameQuery.trim());
  for (const id of filters.categoryIds) params.append('category_id', String(id));
  for (const id of filters.marketGroupIds) params.append('market_group_id', String(id));
  for (const id of filters.includeBuySystemIds) params.append('include_buy_system_id', String(id));
  for (const id of filters.includeSellSystemIds) params.append('include_sell_system_id', String(id));
  for (const id of filters.excludeSystemIds) params.append('exclude_system_id', String(id));
  for (const cls of filters.buySecurityClasses) params.append('buy_security_class', cls);
  for (const cls of filters.sellSecurityClasses) params.append('sell_security_class', cls);
  if (filters.minBuyPrice !== null) params.set('min_buy_price', String(filters.minBuyPrice));
  if (filters.maxBuyPrice !== null) params.set('max_buy_price', String(filters.maxBuyPrice));
  if (filters.minSellPrice !== null) params.set('min_sell_price', String(filters.minSellPrice));
  if (filters.maxSellPrice !== null) params.set('max_sell_price', String(filters.maxSellPrice));
  if (filters.minProfit !== null) params.set('min_profit', String(filters.minProfit));
  if (filters.minProfitPct !== null) params.set('min_profit_pct', String(filters.minProfitPct));
  if (filters.minVolume !== null) params.set('min_volume', String(filters.minVolume));
  if (filters.maxTotalCost !== null) params.set('max_total_cost', String(filters.maxTotalCost));
  if (filters.cargoCapacityM3 !== null) params.set('cargo_capacity_m3', String(filters.cargoCapacityM3));
  if (filters.fromSystemId !== null) params.set('from_system_id', String(filters.fromSystemId));
  if (filters.maxJumpsFromLocation !== null) params.set('max_jumps_from_location', String(filters.maxJumpsFromLocation));
  if (filters.securityProfile) params.set('security_profile', filters.securityProfile);
  params.set('sales_tax_pct', String(filters.salesTaxPct));
  params.set('require_bid_exceeds_offer', String(filters.requireBidExceedsOffer));
  params.set('sort_by', filters.sortBy);
  params.set('sort_desc', String(filters.sortDesc));
  params.set('limit', String(ARBITRAGE_PAGE_SIZE));
  params.set('offset', String(page * ARBITRAGE_PAGE_SIZE));
  return params.toString();
}

export function useArbitrage(
  filters: ArbitrageFilters,
  page: number,
): { opportunities: ArbitrageOpportunity[]; loading: boolean; error: string | null } {
  const [opportunities, setOpportunities] = useState<ArbitrageOpportunity[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Same reasoning as useMarketOrders: react to the built query string, not
  // the filters object by reference, so an unrelated re-render doesn't
  // trigger a refetch.
  const query = buildQuery(filters, page);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    catalogRequest<ArbitrageOpportunity[]>(`/market/arbitrage?${query}`, controller.signal)
      .then((o) => {
        setOpportunities(o);
        setError(null);
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setError(err instanceof Error ? err.message : 'Failed to load arbitrage opportunities.');
      })
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, [query]);

  return { opportunities, loading, error };
}
