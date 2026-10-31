import { useEffect, useState } from 'react';
import { AnimatedText } from '@eve-anim/text-animations';
import { useRoutePlanner, defaultRoutePlannerParams } from '../../api/catalog/useRoutePlanner';
import { useArbitrage, defaultArbitrageFilters } from '../../api/catalog/useArbitrage';
import { useCategories } from '../../api/catalog/useCategories';
import { useSystems } from '../../api/map/useSystems';
import { useTypeDetail } from '../../api/catalog/useTypeDetail';
import { useOrderBook } from '../../api/catalog/useOrderBook';
import { ArbitrageFilterPanel } from '../arbitrage/ArbitrageFilterPanel';
import { ArbitrageGrid } from '../arbitrage/ArbitrageGrid';
import { LocationPicker } from '../arbitrage/LocationPicker';
import { GalaxyMap } from '../map/GalaxyMap';
import { OrderBook } from '../market/OrderBook';
import { SHIP_PRESETS } from '../../lib/shipPresets';
import { ISK_BUDGET_OPTIONS, formatIskBudget } from '../../lib/iskBudget';
import { SECURITY_PROFILE_OPTIONS } from '../../lib/securityProfile';
import { RoutePlanCard } from './RoutePlanCard';
import type {
  ArbitrageFilters,
  ArbitrageOpportunity,
  ArbitrageSortField,
  OrderFilters,
  RoutePlannerParams,
} from '../../api/catalog/types';

// The in-page order book (opened by clicking an item) is unfiltered --
// every region, no price/qty bounds -- since there's no filter UI for it
// here, unlike the standalone Market page.
const UNFILTERED: OrderFilters = { regionIds: [], minPrice: null, maxPrice: null, minQty: null, securityClasses: [] };

// Route searches are restricted to the four main trade hubs as a start
// system -- an unconstrained first hop is what makes the search slow, and
// realistic hauling almost always starts from one of these.
const TRADE_HUBS: { name: string; systemId: number }[] = [
  { name: 'Jita', systemId: 30000142 },
  { name: 'Amarr', systemId: 30002187 },
  { name: 'Dodixie', systemId: 30002659 },
  { name: 'Hek', systemId: 30002053 },
];

type MapFocus = { sourceSystemId: number; targetSystemId: number };
type ViewTab = 'route' | 'opportunities';

// Leg count is held at 3 for now -- search cost grows fast per extra leg.
// The input still exists (1..3) but can't go higher. Result count is no
// longer a knob: the server returns every profitable route it finds.
const MAX_LEGS_CAP = 3;

const activeTabStyle = { borderColor: 'var(--accent-cyan)', color: 'var(--accent-cyan)' };

function clampCap(value: number, cap: number): number {
  return Math.min(cap, Math.max(1, Math.round(value)));
}

/** Full-screen order-book overlay for one item -- the "next to the map"
 * panel, opened by clicking an item name anywhere on this page. Its own
 * component so `useOrderBook`/`useTypeDetail` only run while it's open. */
function RouteItemBook({ typeId, onClose }: { typeId: number; onClose: () => void }) {
  const { type } = useTypeDetail(typeId);
  const { asks, bids, loading, error } = useOrderBook(typeId, UNFILTERED);
  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 200,
        background: 'rgba(2, 4, 10, 0.72)',
        backdropFilter: 'blur(2px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
    >
      <div
        className="panel panel--tight"
        onClick={(e) => e.stopPropagation()}
        style={{ width: 'min(1200px, 94vw)', height: 'min(860px, 90vh)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
      >
        <div className="panel-header">
          <h3 className="panel-title">{type?.name ?? `Item ${typeId}`} — order book</h3>
          <button className="btn" onClick={onClose}>
            Close ✕
          </button>
        </div>
        <div style={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
          <OrderBook asks={asks} bids={bids} loading={loading} error={error} />
        </div>
      </div>
    </div>
  );
}

/** Everything RoutePlannerParams mirrors from ArbitrageFilters field-for-field
 * (see that interface's doc comment) -- pulled out of the filter panel's
 * state and merged into the route-only fields right before a search fires,
 * so there's exactly one set of "which items are even eligible" inputs on
 * this page instead of two. */
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
    excludeIllegal: f.excludeIllegal,
  };
}

/**
 * Branch-and-bound multi-hop itinerary builder (see catalog-api's
 * routes/route_planner.rs) merged with the full-market arbitrage scanner.
 * Two tabs: "Route Planner" searches for a multi-hop itinerary and shows
 * the ship/route controls on the left; "Opportunities" browses every
 * single-item flip right now and shows the item/price/security filters on
 * the left instead. Both tabs share one `filters` state, so the filters
 * set on the Opportunities tab still scope a route search.
 */
export function RoutePlannerPage() {
  const { systems } = useSystems();
  const { categories } = useCategories();

  const [filters, setFilters] = useState<ArbitrageFilters>(defaultArbitrageFilters);
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<ArbitrageOpportunity | null>(null);
  const [tab, setTab] = useState<ViewTab>('route');
  const { opportunities, loading: opportunitiesLoading, error: opportunitiesError } = useArbitrage(filters, page);

  const [params, setParams] = useState<RoutePlannerParams>(defaultRoutePlannerParams);
  const { plans, loading, error, plan } = useRoutePlanner();
  // `mapFocus` is the route pair the map is (or was last) showing;
  // `mapOpen` toggles the overlay. Closing keeps `mapFocus` so the
  // floating "Show route map" button can reopen it unchanged.
  const [mapFocus, setMapFocus] = useState<MapFocus | null>(null);
  const [mapOpen, setMapOpen] = useState(false);
  // Compact by default so the "Selected system" / route-stop detail that
  // GalaxyMap renders under the canvas is visible in the overlay without
  // scrolling; "Expand" gives the canvas the whole viewport.
  const [mapExpanded, setMapExpanded] = useState(false);

  function openMap(focus: MapFocus) {
    setMapFocus(focus);
    setMapExpanded(false);
    setMapOpen(true);
  }

  // Order-book panel: sits alongside the map as a second overlay, opened
  // by clicking an item name anywhere on this page. `bookTypeId` is kept
  // after close so the floating button can reopen it.
  const [bookTypeId, setBookTypeId] = useState<number | null>(null);
  const [bookOpen, setBookOpen] = useState(false);

  function openBook(typeId: number) {
    setBookTypeId(typeId);
    setBookOpen(true);
  }

  useEffect(() => {
    if (!mapOpen && !bookOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape') return;
      setMapOpen(false);
      setBookOpen(false);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mapOpen, bookOpen]);

  const canPlan =
    params.startSystemId !== null && params.cargoCapacityM3 !== null && params.iskAvailable !== null;

  // Cargo capacity is fixed by the ship for now (no free-text hold size);
  // ISK budget is picked separately from ISK_BUDGET_OPTIONS.
  function applyPreset(label: string) {
    const preset = SHIP_PRESETS.find((p) => p.label === label) ?? null;
    setParams({ ...params, cargoCapacityM3: preset?.cargoM3 ?? null });
    setFilters({ ...filters, cargoCapacityM3: preset?.cargoM3 ?? null });
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
    openMap({ sourceSystemId: o.buy_system_id, targetSystemId: o.sell_system_id });
  }

  const effectiveMaxLegs = params.maxLegs ?? MAX_LEGS_CAP;
  const canReturnToStart = effectiveMaxLegs >= 2 && params.targetSystemId === null;

  function setMaxLegs(value: number | null) {
    const next = value === null ? null : clampCap(value, MAX_LEGS_CAP);
    setParams({ ...params, maxLegs: next, returnToStart: params.returnToStart && (next ?? MAX_LEGS_CAP) >= 2 });
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

  const presetValue = SHIP_PRESETS.find((p) => p.cargoM3 === params.cargoCapacityM3)?.label ?? '';

  const routeControls = (
    <div className="panel panel--tight" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="field" style={{ margin: 0 }}>
        <label>Ship</label>
        <select value={presetValue} onChange={(e) => applyPreset(e.target.value)}>
          <option value="">— select a ship —</option>
          {SHIP_PRESETS.map((p) => (
            <option key={p.label} value={p.label}>
              {p.label} ({p.cargoM3.toLocaleString()} m³)
            </option>
          ))}
        </select>
        <p className="field-help" style={{ margin: '6px 0 0' }}>
          Sets cargo capacity from a rough figure for that ship class -- fixed by the ship for now.
        </p>
      </div>

      <div className="field" style={{ margin: 0 }}>
        <label>Cargo capacity, m³</label>
        <input type="number" readOnly disabled value={params.cargoCapacityM3 ?? ''} />
      </div>

      <div className="field" style={{ margin: 0 }}>
        <label>ISK budget</label>
        <select
          value={params.iskAvailable ?? ''}
          onChange={(e) => setParams({ ...params, iskAvailable: e.target.value === '' ? null : Number(e.target.value) })}
        >
          <option value="">— select budget —</option>
          {ISK_BUDGET_OPTIONS.map((v) => (
            <option key={v} value={v}>
              {formatIskBudget(v)}
            </option>
          ))}
        </select>
        {params.iskAvailable !== null && (
          <p className="field-help" style={{ margin: '6px 0 0' }}>
            Planning against <span className="mono">{formatIskBudget(params.iskAvailable)}</span> ISK.
          </p>
        )}
      </div>

      <div className="field" style={{ margin: 0 }}>
        <label>Security</label>
        <select
          value={filters.securityProfile}
          onChange={(e) => updateFilters({ ...filters, securityProfile: e.target.value as ArbitrageFilters['securityProfile'] })}
        >
          {SECURITY_PROFILE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <p className="field-help" style={{ margin: '6px 0 0' }}>
          Where the route may buy and sell, and which space the jump path between stops avoids.
        </p>
      </div>

      <div className="field" style={{ margin: 0 }}>
        <label>Starting system</label>
        <select
          value={params.startSystemId ?? ''}
          onChange={(e) => setParams({ ...params, startSystemId: e.target.value === '' ? null : Number(e.target.value) })}
        >
          <option value="">— select a trade hub —</option>
          {TRADE_HUBS.map((h) => (
            <option key={h.systemId} value={h.systemId}>
              {h.name}
            </option>
          ))}
        </select>
      </div>

      <LocationPicker
        label="Target system (optional)"
        systems={systems}
        selectedId={params.targetSystemId}
        onChange={setTargetSystemId}
      />

      <div className="field" style={{ margin: 0 }}>
        <label>Max legs</label>
        <input
          type="number"
          min={1}
          max={MAX_LEGS_CAP}
          placeholder={`${MAX_LEGS_CAP} (default)`}
          value={params.maxLegs ?? ''}
          onChange={(e) => setMaxLegs(e.target.value === '' ? null : Number(e.target.value))}
        />
        <p className="field-help" style={{ margin: '6px 0 0' }}>
          Maximum is {MAX_LEGS_CAP} for now.
        </p>
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
  );

  return (
    <section className="section" style={{ paddingTop: 32 }}>
      <div className="section-inner">
        <p className="eyebrow">New Eden // Route Planner</p>
        <AnimatedText
          as="h2"
          className="section-heading"
          preset="fade-up-words"
          settingsOverrides={{ text: 'Buy here, sell there, repeat.' }}
          styleOverrides={{ fontSize: 34, textAlign: 'left', color: '#eef4fa' }}
        />

        <nav style={{ display: 'flex', gap: 8, marginTop: 24 }}>
          <button className="btn" style={tab === 'route' ? activeTabStyle : undefined} onClick={() => setTab('route')}>
            Route Planner
          </button>
          <button
            className="btn"
            style={tab === 'opportunities' ? activeTabStyle : undefined}
            onClick={() => setTab('opportunities')}
          >
            Opportunities
          </button>
        </nav>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 0.85fr) minmax(0, 2.15fr)',
            gap: 20,
            marginTop: 16,
            alignItems: 'start',
          }}
        >
          <div>
            {tab === 'route' ? (
              routeControls
            ) : (
              <ArbitrageFilterPanel filters={filters} onChange={updateFilters} categories={categories} systems={systems} />
            )}
          </div>

          <div>
            {tab === 'route' && (
              <>
                {error && <p className="error-text">{error}</p>}
                {!loading && plans.length === 0 && !error && (
                  <p className="text-muted mono">Set your constraints and hit "Plan route" to search for hauling itineraries.</p>
                )}
                {plans.map((p, i) => (
                  <RoutePlanCard key={i} plan={p} index={i} onViewOnMap={openMap} onOpenBook={openBook} />
                ))}
              </>
            )}

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
                  onOpenBook={openBook}
                />
                {selected && (
                  <div className="panel panel--tight" style={{ marginTop: 12 }}>
                    <div className="panel-header">
                      <h3 className="panel-title">{selected.type_name}</h3>
                      <button className="btn" style={{ fontSize: 11, padding: '6px 10px' }} onClick={() => openBook(selected.type_id)}>
                        Order book
                      </button>
                    </div>
                    <p className="field-help" style={{ margin: 0 }}>
                      {selected.buy_system_name} → {selected.sell_system_name}
                    </p>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

      </div>

      {((mapFocus && !mapOpen) || (bookTypeId !== null && !bookOpen)) && (
        <div style={{ position: 'fixed', right: 20, bottom: 20, zIndex: 150, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {bookTypeId !== null && !bookOpen && (
            <button className="btn btn--primary" onClick={() => setBookOpen(true)}>
              📖 Show order book
            </button>
          )}
          {mapFocus && !mapOpen && (
            <button className="btn btn--primary" onClick={() => setMapOpen(true)}>
              ◹ Show route map
            </button>
          )}
        </div>
      )}

      {bookOpen && bookTypeId !== null && <RouteItemBook typeId={bookTypeId} onClose={() => setBookOpen(false)} />}

      {mapFocus && mapOpen && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => setMapOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 200,
            background: 'rgba(2, 4, 10, 0.72)',
            backdropFilter: 'blur(2px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 24,
          }}
        >
          <div
            className="panel panel--tight"
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 'min(1200px, 94vw)',
              height: 'min(860px, 90vh)',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
            <div className="panel-header">
              <h3 className="panel-title">Route on map</h3>
              <button className="btn" onClick={() => setMapOpen(false)}>
                Close ✕
              </button>
            </div>
            <div style={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
              <GalaxyMap
                focusRoute={mapFocus}
                initialRouteProfile={filters.securityProfile}
                canvasHeight={mapExpanded ? '76vh' : 340}
                canvasActions={
                  <button className="btn" onClick={() => setMapExpanded((v) => !v)}>
                    {mapExpanded ? '▣ Collapse' : '⤢ Expand'}
                  </button>
                }
              />
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
