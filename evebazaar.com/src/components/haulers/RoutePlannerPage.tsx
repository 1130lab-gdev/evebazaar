import { useState } from 'react';
import { AnimatedText } from '@eve-anim/text-animations';
import { useHaulers } from '../../api/catalog/useHaulers';
import { useRuns } from '../../api/catalog/useRuns';
import { useRoutePlanner, defaultRoutePlannerParams } from '../../api/catalog/useRoutePlanner';
import { useArbitrage, defaultArbitrageFilters } from '../../api/catalog/useArbitrage';
import { useCategories } from '../../api/catalog/useCategories';
import { useSystems } from '../../api/map/useSystems';
import { ArbitrageFilterPanel } from '../arbitrage/ArbitrageFilterPanel';
import { ArbitrageGrid } from '../arbitrage/ArbitrageGrid';
import { SaveOpportunityAsRun } from '../arbitrage/SaveOpportunityAsRun';
import { LocationPicker } from '../arbitrage/LocationPicker';
import { GalaxyMap } from '../map/GalaxyMap';
import { RoutePlanCard } from './RoutePlanCard';
import type {
  ArbitrageFilters,
  ArbitrageOpportunity,
  ArbitrageSortField,
  RoutePlan,
  RoutePlannerParams,
} from '../../api/catalog/types';

type MapFocus = { sourceSystemId: number; targetSystemId: number };
type ViewTab = 'opportunities' | 'route';

const activeTabStyle = { borderColor: 'var(--accent-cyan)', color: 'var(--accent-cyan)' };

/** Everything RoutePlannerParams mirrors from ArbitrageFilters field-for-field
 * (see that interface's doc comment) -- pulled out of the shared filter
 * panel's state and merged into the route-only fields right before a search
 * fires, so there's exactly one set of "which items are even eligible"
 * inputs on this page instead of two. */
function filtersToRouteExtras(f: ArbitrageFilters) {
  return {
    nameQuery: f.nameQuery,
    categoryIds: f.categoryIds,
    marketGroupIds: f.marketGroupIds,
    minBuyPrice: f.minBuyPrice,
    maxBuyPrice: f.maxBuyPrice,
    minSellPrice: f.minSellPrice,
    maxSellPrice: f.maxSellPrice,
    minProfit: f.minProfit,
    minProfitPct: f.minProfitPct,
    minVolume: f.minVolume,
    maxTotalCost: f.maxTotalCost,
    excludeSystemIds: f.excludeSystemIds,
    buySecurityClasses: f.buySecurityClasses,
    sellSecurityClasses: f.sellSecurityClasses,
    securityProfile: f.securityProfile,
    salesTaxPct: f.salesTaxPct,
  };
}

/**
 * Branch-and-bound multi-hop itinerary builder (see catalog-api's
 * routes/route_planner.rs) merged with the full-market arbitrage scanner --
 * one shared filter set (name/category/price/profit/volume/security, via
 * the same ArbitrageFilterPanel + ArbitrageGrid the old standalone Arbitrage
 * page used) drives both "browse every single-item opportunity right now"
 * (Opportunities tab) and "search for a multi-hop itinerary" (Route Planner
 * tab). The route-only controls (hauler, start/target system, max legs,
 * return-to-start, max results) live in their own small panel since they
 * don't mean anything to the single-item grid.
 */
export function RoutePlannerPage() {
  const { haulers } = useHaulers();
  const { systems } = useSystems();
  const { categories } = useCategories();

  const [filters, setFilters] = useState<ArbitrageFilters>(defaultArbitrageFilters);
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<ArbitrageOpportunity | null>(null);
  const [filtersCollapsed, setFiltersCollapsed] = useState(false);
  const [tab, setTab] = useState<ViewTab>('route');
  const { opportunities, loading: opportunitiesLoading, error: opportunitiesError } = useArbitrage(filters, page);

  const [params, setParams] = useState<RoutePlannerParams>(defaultRoutePlannerParams);
  const { plans, loading, error, plan } = useRoutePlanner();
  const { createRun } = useRuns(params.haulerId);
  const [mapFocus, setMapFocus] = useState<MapFocus | null>(null);

  const selectedHauler = haulers.find((h) => h.hauler_id === params.haulerId) ?? null;
  const canPlan =
    params.startSystemId !== null && (selectedHauler !== null || (params.cargoCapacityM3 !== null && params.iskAvailable !== null));

  function selectHauler(id: number | null) {
    const hauler = id !== null ? haulers.find((h) => h.hauler_id === id) : undefined;
    setParams({
      ...params,
      haulerId: id,
      startSystemId: hauler?.home_system_id ?? params.startSystemId,
    });
    setFilters({
      ...filters,
      securityProfile: hauler?.route_security_profile ?? filters.securityProfile,
      fromSystemId: hauler?.home_system_id ?? filters.fromSystemId,
      cargoCapacityM3: hauler?.cargo_capacity_m3 ?? filters.cargoCapacityM3,
      maxTotalCost: hauler?.isk_available ?? filters.maxTotalCost,
    });
  }

  function updateFilters(next: ArbitrageFilters) {
    setFilters(next);
    setPage(0);
  }

  function sortChange(field: ArbitrageSortField) {
    setFilters((prev) => (prev.sortBy === field ? { ...prev, sortDesc: !prev.sortDesc } : { ...prev, sortBy: field, sortDesc: true }));
    setPage(0);
  }

  function selectRow(o: ArbitrageOpportunity) {
    setSelected(o);
    setMapFocus({ sourceSystemId: o.buy_system_id, targetSystemId: o.sell_system_id });
  }

  const effectiveMaxLegs = params.maxLegs ?? 3;
  const canReturnToStart = effectiveMaxLegs >= 2 && params.targetSystemId === null;

  function setMaxLegs(value: number | null) {
    setParams({ ...params, maxLegs: value, returnToStart: params.returnToStart && (value ?? 3) >= 2 });
  }

  // returnToStart and targetSystemId are mutually exclusive server-side --
  // setting one here clears the other rather than leaving a stale value
  // that'd just get rejected (or silently ignored) on the next plan().
  function setTargetSystemId(id: number | null) {
    setParams({ ...params, targetSystemId: id, returnToStart: id !== null ? false : params.returnToStart });
  }

  function setReturnToStart(checked: boolean) {
    setParams({ ...params, returnToStart: checked, targetSystemId: checked ? null : params.targetSystemId });
  }

  function planRoute() {
    plan({ ...params, ...filtersToRouteExtras(filters) });
  }

  async function saveAsRun(routePlan: RoutePlan) {
    if (params.haulerId === null) throw new Error('select a hauler to save this route as a run');
    await createRun({
      legs: routePlan.legs.map((leg) => ({
        type_id: leg.type_id,
        buy_system_id: leg.buy_system_id,
        sell_system_id: leg.sell_system_id,
        quantity: leg.quantity,
      })),
    });
  }

  return (
    <section className="section" style={{ paddingTop: 140 }}>
      <div className="section-inner">
        <p className="eyebrow">New Eden // Route Planner</p>
        <AnimatedText
          as="h2"
          className="section-heading"
          preset="fade-up-words"
          settingsOverrides={{ text: 'Buy here, sell there, repeat.' }}
          styleOverrides={{ fontSize: 34, textAlign: 'left', color: '#eef4fa' }}
        />

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: filtersCollapsed ? 'auto minmax(0, 1fr)' : 'minmax(0, 0.85fr) minmax(0, 2.15fr)',
            gap: 20,
            marginTop: 24,
            alignItems: 'start',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="panel panel--tight" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div className="field" style={{ margin: 0 }}>
                <label>Hauler</label>
                <select
                  value={params.haulerId ?? ''}
                  onChange={(e) => selectHauler(e.target.value === '' ? null : Number(e.target.value))}
                >
                  <option value="">— enter cargo/ISK manually —</option>
                  {haulers.map((h) => (
                    <option key={h.hauler_id} value={h.hauler_id}>
                      {h.name}
                    </option>
                  ))}
                </select>
                <p className="field-help" style={{ margin: '6px 0 0' }}>
                  Pick a hauler to plan against their saved cargo/ISK/route spec, and to be able to save a result as a
                  run. Also fills in the shared filters below (cargo capacity, buy-out budget, security preference,
                  home system). Manual entry can preview routes but can't be saved.
                </p>
              </div>

              {selectedHauler === null && (
                <>
                  <div className="field" style={{ margin: 0 }}>
                    <label>Cargo capacity, m³</label>
                    <input
                      type="number"
                      value={params.cargoCapacityM3 ?? ''}
                      onChange={(e) => setParams({ ...params, cargoCapacityM3: e.target.value === '' ? null : Number(e.target.value) })}
                    />
                  </div>
                  <div className="field" style={{ margin: 0 }}>
                    <label>ISK available</label>
                    <input
                      type="number"
                      value={params.iskAvailable ?? ''}
                      onChange={(e) => setParams({ ...params, iskAvailable: e.target.value === '' ? null : Number(e.target.value) })}
                    />
                  </div>
                </>
              )}

              <LocationPicker
                label="Starting system"
                systems={systems}
                selectedId={params.startSystemId}
                onChange={(id) => setParams({ ...params, startSystemId: id })}
              />
              <p className="field-help" style={{ margin: '-8px 0 0' }}>
                Required -- prefilled from the selected hauler's home system, if it has one, but still editable, and
                needed for manual entry too. Keeps the first hop's search constrained to somewhere specific instead of
                scanning the whole market, which is what actually makes this fast.
              </p>

              <LocationPicker
                label="Target system (optional)"
                systems={systems}
                selectedId={params.targetSystemId}
                onChange={setTargetSystemId}
              />
              <p className="field-help" style={{ margin: '-8px 0 0' }}>
                Confines every hop's sell side to the shortest path between the two systems, so results are things
                worth carrying along the way from A to B -- not just from A. Leave unset to search freely instead.
                Mutually exclusive with "Return to start" below.
              </p>

              <div className="field" style={{ margin: 0 }}>
                <label>Max legs</label>
                <input
                  type="number"
                  min={1}
                  max={6}
                  placeholder="3 (default)"
                  value={params.maxLegs ?? ''}
                  onChange={(e) => setMaxLegs(e.target.value === '' ? null : Number(e.target.value))}
                />
              </div>

              <label style={{ display: 'flex', alignItems: 'center', gap: 8, margin: 0, textTransform: 'none', letterSpacing: 'normal' }}>
                <input
                  type="checkbox"
                  style={{ width: 'auto' }}
                  checked={params.returnToStart}
                  disabled={!canReturnToStart}
                  onChange={(e) => setReturnToStart(e.target.checked)}
                />
                Return to start (circular route)
              </label>
              <p className="field-help" style={{ margin: '-8px 0 0' }}>
                {params.targetSystemId !== null
                  ? 'Not available with a target system set -- pick one or the other.'
                  : canReturnToStart
                    ? "Forces the last leg to sell back into wherever the route started, instead of ending wherever's most profitable."
                    : 'Needs at least 2 max legs -- a single leg can never buy and sell in the same system.'}
              </p>

              <div className="field" style={{ margin: 0 }}>
                <label>Max results</label>
                <input
                  type="number"
                  min={1}
                  max={5}
                  placeholder="3 (default)"
                  value={params.maxResults ?? ''}
                  onChange={(e) => setParams({ ...params, maxResults: e.target.value === '' ? null : Number(e.target.value) })}
                />
                <p className="field-help" style={{ margin: '6px 0 0' }}>
                  How many of the best routes found come back. The search itself isn't limited by this -- it explores
                  every option worth considering regardless -- this just caps how many you see.
                </p>
              </div>

              <p className="field-help" style={{ margin: 0 }}>
                Item name/category, price/profit/volume ranges, buy-out budget, excluded systems, buy/sell security,
                sales tax %, and route security preference come from the shared filters panel below -- same one the
                Opportunities tab uses.
              </p>

              <button className="btn btn--primary btn--full" disabled={!canPlan || loading} onClick={planRoute}>
                {loading ? 'Planning…' : 'Plan route'}
              </button>
              {loading && (
                <p className="field-help" style={{ margin: 0 }}>
                  Longer searches (more max legs) can take a few seconds -- each additional leg deepens the search by
                  another level.
                </p>
              )}
            </div>

            <div>
              <button
                className="btn"
                style={{ marginBottom: 12, fontSize: 11, padding: '6px 10px' }}
                onClick={() => setFiltersCollapsed((c) => !c)}
              >
                {filtersCollapsed ? '▶ Filters' : '◀ Collapse filters'}
              </button>
              {!filtersCollapsed && (
                <ArbitrageFilterPanel
                  filters={filters}
                  onChange={updateFilters}
                  categories={categories}
                  systems={systems}
                  haulers={haulers}
                  showHaulerPicker={false}
                />
              )}
            </div>
          </div>

          <div>
            <nav style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
              <button
                className="btn"
                style={tab === 'opportunities' ? activeTabStyle : undefined}
                onClick={() => setTab('opportunities')}
              >
                Opportunities
              </button>
              <button className="btn" style={tab === 'route' ? activeTabStyle : undefined} onClick={() => setTab('route')}>
                Route Planner
              </button>
            </nav>

            {tab === 'opportunities' && (
              <>
                <ArbitrageGrid
                  opportunities={opportunities}
                  loading={opportunitiesLoading}
                  error={opportunitiesError}
                  filters={filters}
                  onSortChange={sortChange}
                  page={page}
                  onPageChange={setPage}
                  selectedTypeId={selected?.type_id ?? null}
                  onSelectRow={selectRow}
                />
                {selected && (
                  <div className="panel panel--tight" style={{ marginTop: 12 }}>
                    <div className="panel-header">
                      <h3 className="panel-title">{selected.type_name}</h3>
                    </div>
                    <p className="field-help" style={{ margin: 0 }}>
                      {selected.buy_system_name} → {selected.sell_system_name} -- see the map below.
                    </p>
                    <SaveOpportunityAsRun opportunity={selected} haulers={haulers} />
                  </div>
                )}
              </>
            )}

            {tab === 'route' && (
              <>
                {error && <p className="error-text">{error}</p>}
                {!loading && plans.length === 0 && !error && (
                  <p className="text-muted mono">Set your constraints and hit "Plan route" to search for hauling itineraries.</p>
                )}
                {plans.map((p, i) => (
                  <RoutePlanCard
                    key={i}
                    plan={p}
                    index={i}
                    canSave={params.haulerId !== null}
                    onSave={() => saveAsRun(p)}
                    onViewOnMap={setMapFocus}
                  />
                ))}
              </>
            )}
          </div>
        </div>

        {mapFocus && (
          <div className="panel panel--tight" style={{ marginTop: 20 }}>
            <div className="panel-header">
              <h3 className="panel-title">Route on map</h3>
              <button className="btn" onClick={() => setMapFocus(null)}>
                Hide map
              </button>
            </div>
            <GalaxyMap focusRoute={mapFocus} />
          </div>
        )}
      </div>
    </section>
  );
}
