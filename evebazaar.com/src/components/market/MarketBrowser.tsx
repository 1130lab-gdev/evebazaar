import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AnimatedText } from '@eve-anim/text-animations';
import { ItemSearchBox } from './ItemSearchBox';
import { FilterSidebar } from './FilterSidebar';
import { OrderResultsTable } from './OrderResultsTable';
import { useRegions } from '../../api/catalog/useRegions';
import { useTypeDetail } from '../../api/catalog/useTypeDetail';
import { useMarketOrders } from '../../api/catalog/useMarketOrders';
import type { OrderFilters, SearchResult, SecurityClass } from '../../api/catalog/types';

const SECURITY_CLASSES: SecurityClass[] = ['highsec', 'lowsec', 'nullsec'];

function isSecurityClass(value: string): value is SecurityClass {
  return (SECURITY_CLASSES as string[]).includes(value);
}

// Filter state (and the selected item + page) lives entirely in the URL --
// not React state -- so a search is a shareable/reloadable link, which is
// the point of a "browser" rather than a one-off lookup tool.
function filtersFromParams(params: URLSearchParams): OrderFilters {
  const side = params.get('side');
  return {
    regionIds: params
      .getAll('region_id')
      .map(Number)
      .filter((n) => !Number.isNaN(n)),
    side: side === 'buy' || side === 'sell' ? side : null,
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
  const page = params.has('page') ? Number(params.get('page')) : 0;

  const { orders, loading } = useMarketOrders(typeId, filters, page);

  function selectItem(item: SearchResult) {
    setParams(new URLSearchParams({ type_id: String(item.type_id) }));
  }

  function updateFilters(next: OrderFilters) {
    const nextParams = new URLSearchParams(params);
    nextParams.delete('region_id');
    next.regionIds.forEach((id) => nextParams.append('region_id', String(id)));
    if (next.side) nextParams.set('side', next.side);
    else nextParams.delete('side');
    if (next.minPrice !== null) nextParams.set('min_price', String(next.minPrice));
    else nextParams.delete('min_price');
    if (next.maxPrice !== null) nextParams.set('max_price', String(next.maxPrice));
    else nextParams.delete('max_price');
    if (next.minQty !== null) nextParams.set('min_qty', String(next.minQty));
    else nextParams.delete('min_qty');
    nextParams.delete('security_class');
    next.securityClasses.forEach((c) => nextParams.append('security_class', c));
    nextParams.delete('page');
    setParams(nextParams);
  }

  function changePage(next: number) {
    const nextParams = new URLSearchParams(params);
    nextParams.set('page', String(next));
    setParams(nextParams);
  }

  return (
    <section className="section" style={{ paddingTop: 140 }}>
      <div className="section-inner">
        <p className="eyebrow">New Eden // Item Catalog</p>
        <AnimatedText
          as="h2"
          className="section-heading"
          preset="fade-up-words"
          settingsOverrides={{ text: 'Search the bazaar. Filter the book.' }}
          styleOverrides={{ fontSize: 34, textAlign: 'left', color: '#eef4fa' }}
        />

        <div style={{ marginTop: 32, marginBottom: 28, maxWidth: 420 }}>
          <ItemSearchBox onSelect={selectItem} />
        </div>

        {typeId === null && (
          <p className="text-muted mono" style={{ fontSize: 13 }}>
            Search for an item above to see its live buy and sell orders across every region.
          </p>
        )}

        {typeId !== null && (
          <>
            {type && (
              <div style={{ marginBottom: 20 }}>
                <h3 style={{ margin: 0, fontSize: 20, color: 'var(--text-primary)' }}>{type.name}</h3>
                <p className="text-muted mono" style={{ fontSize: 12, margin: '4px 0 0' }}>
                  {type.category_name} / {type.group_name}
                </p>
              </div>
            )}
            <div
              className="market-grid"
              style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 0.75fr) minmax(0, 2.25fr)', gap: 20, alignItems: 'start' }}
            >
              <FilterSidebar regions={regions} filters={filters} onChange={updateFilters} />
              <OrderResultsTable orders={orders} loading={loading} page={page} onPageChange={changePage} />
            </div>
          </>
        )}
      </div>
    </section>
  );
}
