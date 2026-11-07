import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AnimatedText } from '@eve-anim/text-animations';
import { ItemSearchBox } from './ItemSearchBox';
import { FilterSidebar } from './FilterSidebar';
import { OrderBook } from './OrderBook';
import { PinnedItems } from './PinnedItems';
import { useRegions } from '../../api/catalog/useRegions';
import { useTypeDetail } from '../../api/catalog/useTypeDetail';
import { useOrderBook } from '../../api/catalog/useOrderBook';
import { loadPinnedItems, savePinnedItems, togglePinnedItem, type PinnedItem } from '../../lib/pinnedItems';
import type { OrderFilters, SearchResult, SecurityClass } from '../../api/catalog/types';

const SECURITY_CLASSES: SecurityClass[] = ['highsec', 'lowsec', 'nullsec'];

function isSecurityClass(value: string): value is SecurityClass {
  return (SECURITY_CLASSES as string[]).includes(value);
}

// Filter state (and the selected item) lives entirely in the URL -- not
// React state -- so a search is a shareable/reloadable link.
function filtersFromParams(params: URLSearchParams): OrderFilters {
  return {
    regionIds: params
      .getAll('region_id')
      .map(Number)
      .filter((n) => !Number.isNaN(n)),
    minPrice: params.has('min_price') ? Number(params.get('min_price')) : null,
    maxPrice: params.has('max_price') ? Number(params.get('max_price')) : null,
    minQty: params.has('min_qty') ? Number(params.get('min_qty')) : null,
    securityClasses: params.getAll('security_class').filter(isSecurityClass),
  };
}

export function MarketBrowser() {
  const [params, setParams] = useSearchParams();
  const { regions } = useRegions();

  const typeId = params.has('type_id') ? Number(params.get('type_id')) : null;
  const { type } = useTypeDetail(typeId);
  const filters = useMemo(() => filtersFromParams(params), [params]);

  const { asks, bids, loading, error } = useOrderBook(typeId, filters);

  const [pinned, setPinned] = useState<PinnedItem[]>(loadPinnedItems);
  useEffect(() => {
    savePinnedItems(pinned);
  }, [pinned]);

  const isPinned = typeId !== null && pinned.some((p) => p.typeId === typeId);

  const selectType = useCallback(
    (nextTypeId: number) => {
      // Keep the current filters, just swap the item + drop the page.
      const next = new URLSearchParams(params);
      next.set('type_id', String(nextTypeId));
      setParams(next);
    },
    [params, setParams],
  );

  function selectItem(item: SearchResult) {
    selectType(item.type_id);
  }

  function togglePin() {
    if (typeId === null) return;
    const name = type?.name ?? pinned.find((p) => p.typeId === typeId)?.name ?? `type ${typeId}`;
    setPinned((cur) => togglePinnedItem(cur, { typeId, name }));
  }

  function updateFilters(next: OrderFilters) {
    const nextParams = new URLSearchParams(params);
    nextParams.delete('region_id');
    next.regionIds.forEach((id) => nextParams.append('region_id', String(id)));
    if (next.minPrice !== null) nextParams.set('min_price', String(next.minPrice));
    else nextParams.delete('min_price');
    if (next.maxPrice !== null) nextParams.set('max_price', String(next.maxPrice));
    else nextParams.delete('max_price');
    if (next.minQty !== null) nextParams.set('min_qty', String(next.minQty));
    else nextParams.delete('min_qty');
    nextParams.delete('security_class');
    next.securityClasses.forEach((c) => nextParams.append('security_class', c));
    setParams(nextParams);
  }

  return (
    <section className="section" style={{ paddingTop: 32 }}>
      <div className="section-inner">
        <p className="eyebrow">New Eden // Item Catalog</p>
        <AnimatedText
          as="h2"
          className="section-heading"
          preset="fade-up-words"
          settingsOverrides={{ text: 'Search the bazaar. Read the book.' }}
          styleOverrides={{ fontSize: 34, textAlign: 'left', color: '#eef4fa' }}
        />

        <div style={{ marginTop: 32, marginBottom: 20, maxWidth: 420 }}>
          <ItemSearchBox onSelect={selectItem} />
        </div>

        <PinnedItems
          items={pinned}
          activeTypeId={typeId}
          onSelect={selectType}
          onRemove={(id) => setPinned((cur) => cur.filter((p) => p.typeId !== id))}
        />

        {typeId === null && (
          <p className="text-muted mono" style={{ fontSize: 13 }}>
            Search for an item above to see its live order book across every region.
          </p>
        )}

        {typeId !== null && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 20, color: 'var(--text-primary)' }}>{type?.name ?? `type ${typeId}`}</h3>
                {type && (
                  <p className="text-muted mono" style={{ fontSize: 12, margin: '4px 0 0' }}>
                    {type.category_name} / {type.group_name}
                  </p>
                )}
              </div>
              <button
                type="button"
                className="btn"
                onClick={togglePin}
                style={isPinned ? { borderColor: 'var(--accent-cyan)', color: 'var(--accent-cyan)' } : undefined}
              >
                {isPinned ? '★ Pinned' : '☆ Pin'}
              </button>
            </div>
            <div
              className="market-grid"
              style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 0.75fr) minmax(0, 2.25fr)', gap: 20, alignItems: 'start' }}
            >
              <FilterSidebar regions={regions} filters={filters} onChange={updateFilters} />
              <OrderBook asks={asks} bids={bids} loading={loading} error={error} />
            </div>
          </>
        )}
      </div>
    </section>
  );
}
