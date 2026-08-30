import type { CSSProperties } from 'react';
import type { ArbitrageFilters, ArbitrageOpportunity, ArbitrageSortField } from '../../api/catalog/types';
import { securityColor } from '../../lib/securityColor';
import { formatIsk, formatQty, formatSecStatus, formatVolume } from '../../lib/format';
import { ARBITRAGE_PAGE_SIZE } from '../../api/catalog/useArbitrage';
import { ItemInfoIcon } from '../ui/ItemInfoIcon';

const COLUMNS: { field: ArbitrageSortField; label: string }[] = [
  { field: 'name', label: 'Item' },
  { field: 'size', label: 'Size' },
  { field: 'buy_price', label: 'Buy at' },
  { field: 'sell_price', label: 'Sell at' },
  { field: 'profit', label: 'Net profit/unit' },
  { field: 'profit_pct', label: 'Net margin' },
  { field: 'volume', label: 'Volume' },
  { field: 'buy_system', label: 'Buy system' },
];

const COLUMNS_AFTER_DISTANCE: { field: ArbitrageSortField; label: string }[] = [
  { field: 'sell_system', label: 'Sell system' },
  { field: 'jumps', label: 'Jumps' },
  { field: 'isk_per_jump', label: 'ISK/jump' },
];

// The grid scrolls both directions once its 11+ columns and up to 50 rows
// overflow the panel -- pins column headers to the top of that scroll
// container so they stay readable while scrolling through rows. Needs an
// explicit background (the panel's own, not transparent) since a sticky
// element otherwise lets scrolled-past rows show through underneath it.
const stickyHeader: CSSProperties = { position: 'sticky', top: 0, background: 'var(--bg-panel)', zIndex: 1 };

export function ArbitrageGrid({
  opportunities,
  loading,
  error,
  filters,
  onSortChange,
  page,
  onPageChange,
  selectedTypeId,
  onSelectRow,
  onOpenBook,
}: {
  opportunities: ArbitrageOpportunity[];
  loading: boolean;
  error: string | null;
  filters: ArbitrageFilters;
  onSortChange: (field: ArbitrageSortField) => void;
  page: number;
  onPageChange: (page: number) => void;
  selectedTypeId: number | null;
  onSelectRow: (opportunity: ArbitrageOpportunity) => void;
  /** Open the in-page order-book panel for this item. */
  onOpenBook: (typeId: number) => void;
}) {
  const showTripProfit = filters.cargoCapacityM3 !== null;
  const showDistance = filters.fromSystemId !== null;

  function sortIndicator(field: ArbitrageSortField): string {
    if (filters.sortBy !== field) return '';
    return filters.sortDesc ? ' ▼' : ' ▲';
  }

  function sortableHeader(field: ArbitrageSortField, label: string) {
    return (
      <th key={field} style={{ ...stickyHeader, cursor: 'pointer' }} onClick={() => onSortChange(field)}>
        {label}
        {sortIndicator(field)}
      </th>
    );
  }

  return (
    <div className="panel panel--tight">
      <div className="panel-header">
        <h3 className="panel-title">Opportunities</h3>
        {loading && (
          <span className="text-muted mono" style={{ fontSize: 11 }}>
            Loading…
          </span>
        )}
      </div>

      {error && <p className="error-text">{error}</p>}

      <div style={{ overflow: 'auto', maxHeight: 'calc(100vh - 340px)' }}>
        <table>
          <thead>
            <tr>
              {COLUMNS.map((col) => sortableHeader(col.field, col.label))}
              {showDistance && sortableHeader('distance_from_location', 'Distance')}
              {COLUMNS_AFTER_DISTANCE.map((col) => sortableHeader(col.field, col.label))}
              {showTripProfit && sortableHeader('trip_profit', 'Trip profit')}
            </tr>
          </thead>
          <tbody>
            {!loading && opportunities.length === 0 && (
              <tr>
                <td colSpan={11 + (showTripProfit ? 1 : 0) + (showDistance ? 1 : 0)} className="text-muted">
                  No opportunities match the current filters.
                </td>
              </tr>
            )}
            {opportunities.map((o) => (
              <tr
                key={o.type_id}
                onClick={() => onSelectRow(o)}
                style={{
                  cursor: 'pointer',
                  ...(o.type_id === selectedTypeId ? { outline: '1px solid var(--accent-cyan)', outlineOffset: -1 } : {}),
                }}
              >
                <td>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenBook(o.type_id);
                    }}
                    title="Show order book"
                    style={{
                      background: 'none',
                      border: 'none',
                      padding: 0,
                      font: 'inherit',
                      color: 'var(--accent-cyan)',
                      cursor: 'pointer',
                      textAlign: 'left',
                    }}
                  >
                    {o.type_name}
                  </button>
                  <ItemInfoIcon typeId={o.type_id} typeName={o.type_name} />
                  <div className="text-muted mono" style={{ fontSize: 10 }}>
                    {o.category_name}
                  </div>
                </td>
                <td className="mono text-muted">{o.packaged_volume !== null ? formatVolume(o.packaged_volume) : '—'}</td>
                <td className="mono">{formatIsk(o.buy_price)}</td>
                <td className="mono">
                  {formatIsk(o.sell_price)}
                  <div className="text-muted" style={{ fontSize: 10 }}>
                    {formatIsk(o.net_sell_price)} after tax
                  </div>
                </td>
                <td className="mono text-buy">{formatIsk(o.profit_per_unit)}</td>
                <td className="mono text-buy">{o.profit_pct.toFixed(1)}%</td>
                <td className="mono text-muted">{formatQty(o.volume_available)}</td>
                <td className="text-muted">
                  {o.buy_system_name}
                  <span className="mono" style={{ color: securityColor(o.buy_security_status), marginLeft: 6 }}>
                    {formatSecStatus(o.buy_security_status)}
                  </span>
                  <div className="text-muted" style={{ fontSize: 10 }}>
                    {o.buy_region_name}
                  </div>
                </td>
                {showDistance && <td className="mono text-muted">{o.distance_from_location ?? '—'}</td>}
                <td className="text-muted">
                  {o.sell_system_name}
                  <span className="mono" style={{ color: securityColor(o.sell_security_status), marginLeft: 6 }}>
                    {formatSecStatus(o.sell_security_status)}
                  </span>
                  <div className="text-muted" style={{ fontSize: 10 }}>
                    {o.sell_region_name}
                  </div>
                </td>
                <td className="mono text-muted">{o.jumps ?? '—'}</td>
                <td className="mono text-buy">{o.isk_per_jump !== null ? formatIsk(o.isk_per_jump) : '—'}</td>
                {showTripProfit && (
                  <td className="mono text-buy">{o.trip_profit !== null ? formatIsk(o.trip_profit) : '—'}</td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
        <button className="btn" disabled={page === 0} onClick={() => onPageChange(page - 1)}>
          Prev
        </button>
        <button className="btn" disabled={opportunities.length < ARBITRAGE_PAGE_SIZE} onClick={() => onPageChange(page + 1)}>
          Next
        </button>
      </div>
    </div>
  );
}
