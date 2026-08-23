import { useState } from 'react';
import { AnimatedText } from '@eve-anim/text-animations';
import { ArbitrageFilterPanel } from './ArbitrageFilterPanel';
import { ArbitrageGrid } from './ArbitrageGrid';
import { SaveOpportunityAsRun } from './SaveOpportunityAsRun';
import { useArbitrage, defaultArbitrageFilters } from '../../api/catalog/useArbitrage';
import { useCategories } from '../../api/catalog/useCategories';
import { useHaulers } from '../../api/catalog/useHaulers';
import { useSystems } from '../../api/map/useSystems';
import type { ArbitrageFilters, ArbitrageOpportunity, ArbitrageSortField } from '../../api/catalog/types';
import { GalaxyMap } from '../map/GalaxyMap';

type ViewTab = 'opportunities' | 'route';

const activeTabStyle = { borderColor: 'var(--accent-cyan)', color: 'var(--accent-cyan)' };

/**
 * Full market-wide scan: for every tradeable item, the single best
 * cross-system buy-low-sell-high pairing (see catalog-api's
 * /market/arbitrage and db/arbitrage.rs for how that's computed
 * server-side -- this page is purely presentation + filter state).
 * Clicking a row switches to the Route tab and drives GalaxyMap to that
 * opportunity's route via its `focusRoute` prop.
 */
export function ArbitragePage() {
  const [filters, setFilters] = useState<ArbitrageFilters>(defaultArbitrageFilters);
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<ArbitrageOpportunity | null>(null);
  const [filtersCollapsed, setFiltersCollapsed] = useState(false);
  const [tab, setTab] = useState<ViewTab>('opportunities');

  const { categories } = useCategories();
  const { systems } = useSystems();
  const { haulers } = useHaulers();
  const { opportunities, loading, error } = useArbitrage(filters, page);

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
    setTab('route');
  }

  return (
    <section className="section" style={{ paddingTop: 140 }}>
      <div className="section-inner">
        <p className="eyebrow">New Eden // Arbitrage Scanner</p>
        <AnimatedText
          as="h2"
          className="section-heading"
          preset="fade-up-words"
          settingsOverrides={{ text: 'Find the spread. Plan the run.' }}
          styleOverrides={{ fontSize: 34, textAlign: 'left', color: '#eef4fa' }}
        />

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: filtersCollapsed ? 'auto minmax(0, 1fr)' : 'minmax(0, 0.85fr) minmax(0, 2.15fr)',
            gap: 20,
            alignItems: 'start',
            marginTop: 24,
          }}
        >
          <div>
            <button
              className="btn"
              style={{ marginBottom: 12, fontSize: 11, padding: '6px 10px' }}
              onClick={() => setFiltersCollapsed((c) => !c)}
            >
              {filtersCollapsed ? '▶ Filters' : '◀ Collapse'}
            </button>
            {!filtersCollapsed && (
              <ArbitrageFilterPanel
                filters={filters}
                onChange={updateFilters}
                categories={categories}
                systems={systems}
                haulers={haulers}
              />
            )}
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
                Route
              </button>
            </nav>

            {tab === 'opportunities' && (
              <ArbitrageGrid
                opportunities={opportunities}
                loading={loading}
                error={error}
                filters={filters}
                onSortChange={sortChange}
                page={page}
                onPageChange={setPage}
                selectedTypeId={selected?.type_id ?? null}
                onSelectRow={selectRow}
              />
            )}

            {tab === 'route' && (
              <div className="panel panel--tight">
                <div className="panel-header">
                  <h3 className="panel-title">Route</h3>
                </div>
                {!selected && (
                  <p className="text-muted mono">Select an opportunity from the Opportunities tab to see its hauling route on the map.</p>
                )}
                {selected && (
                  <>
                    <GalaxyMap focusRoute={{ sourceSystemId: selected.buy_system_id, targetSystemId: selected.sell_system_id }} />
                    <SaveOpportunityAsRun opportunity={selected} haulers={haulers} />
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
