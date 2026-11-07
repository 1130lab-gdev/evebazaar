import type { Category } from '../../api/catalog/types';
import type { ArbitrageFilters, SecurityClass } from '../../api/catalog/types';
import type { SystemSummary } from '../../api/map/types';
import { SystemPicker } from './SystemPicker';
import { LocationPicker } from './LocationPicker';
import { SECURITY_PROFILE_OPTIONS } from '../../lib/securityProfile';

const SECURITY_CLASSES: SecurityClass[] = ['highsec', 'lowsec', 'nullsec'];

function numberField(value: number | null, onChange: (v: number | null) => void, placeholder: string) {
  return (
    <input
      type="number"
      placeholder={placeholder}
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
    />
  );
}

export function ArbitrageFilterPanel({
  filters,
  onChange,
  categories,
  systems,
}: {
  filters: ArbitrageFilters;
  onChange: (next: ArbitrageFilters) => void;
  categories: Category[];
  systems: SystemSummary[];
}) {
  function toggleCategory(id: number) {
    const next = filters.categoryIds.includes(id) ? filters.categoryIds.filter((c) => c !== id) : [...filters.categoryIds, id];
    onChange({ ...filters, categoryIds: next });
  }

  function toggleSecurityClass(side: 'buySecurityClasses' | 'sellSecurityClasses', cls: SecurityClass) {
    const current = filters[side];
    const next = current.includes(cls) ? current.filter((c) => c !== cls) : [...current, cls];
    onChange({ ...filters, [side]: next });
  }

  return (
    <div className="panel panel--tight" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div className="field" style={{ margin: 0 }}>
        <label>Item name</label>
        <input
          type="text"
          placeholder="fuzzy match, e.g. tritanium"
          value={filters.nameQuery}
          onChange={(e) => onChange({ ...filters, nameQuery: e.target.value })}
        />
      </div>

      <label style={{ display: 'flex', alignItems: 'center', gap: 8, margin: 0, textTransform: 'none', letterSpacing: 'normal' }}>
        <input
          type="checkbox"
          style={{ width: 'auto' }}
          checked={filters.requireBidExceedsOffer}
          onChange={(e) => onChange({ ...filters, requireBidExceedsOffer: e.target.checked })}
        />
        Only show instantly executable flips (bid &gt; offer)
      </label>

      <label style={{ display: 'flex', alignItems: 'center', gap: 8, margin: 0, textTransform: 'none', letterSpacing: 'normal' }}>
        <input
          type="checkbox"
          style={{ width: 'auto' }}
          checked={filters.excludeIllegal}
          onChange={(e) => onChange({ ...filters, excludeIllegal: e.target.checked })}
        />
        Exclude illegal goods (boosters, slaves)
      </label>

      <div className="field" style={{ margin: 0 }}>
        <label>Cargo capacity, m³</label>
        {numberField(filters.cargoCapacityM3, (v) => onChange({ ...filters, cargoCapacityM3: v }), 'e.g. 13000')}
      </div>

      <div className="field" style={{ margin: 0 }}>
        <label htmlFor="sales-tax-pct">Sales tax %</label>
        <input
          id="sales-tax-pct"
          type="number"
          step="any"
          value={filters.salesTaxPct}
          onChange={(e) => onChange({ ...filters, salesTaxPct: e.target.value === '' ? 0 : Number(e.target.value) })}
        />
      </div>

      <div className="field" style={{ margin: 0 }}>
        <label>Minimum profit margin (after tax)</label>
        <div style={{ display: 'flex', gap: 8 }}>
          {numberField(filters.minProfit, (v) => onChange({ ...filters, minProfit: v }), 'Min ISK')}
          {numberField(filters.minProfitPct, (v) => onChange({ ...filters, minProfitPct: v }), 'Min %')}
        </div>
      </div>

      <div className="field" style={{ margin: 0 }}>
        <label>Buy price (ISK)</label>
        <div style={{ display: 'flex', gap: 8 }}>
          {numberField(filters.minBuyPrice, (v) => onChange({ ...filters, minBuyPrice: v }), 'Min')}
          {numberField(filters.maxBuyPrice, (v) => onChange({ ...filters, maxBuyPrice: v }), 'Max')}
        </div>
      </div>

      <div className="field" style={{ margin: 0 }}>
        <label>Sell price (ISK)</label>
        <div style={{ display: 'flex', gap: 8 }}>
          {numberField(filters.minSellPrice, (v) => onChange({ ...filters, minSellPrice: v }), 'Min')}
          {numberField(filters.maxSellPrice, (v) => onChange({ ...filters, maxSellPrice: v }), 'Max')}
        </div>
      </div>

      <div className="field" style={{ margin: 0 }}>
        <label>Min available volume</label>
        {numberField(filters.minVolume, (v) => onChange({ ...filters, minVolume: v }), 'Any')}
      </div>

      <div className="field" style={{ margin: 0 }}>
        <label>Max total cost to buy out (ISK)</label>
        {numberField(filters.maxTotalCost, (v) => onChange({ ...filters, maxTotalCost: v }), 'No limit')}
      </div>

      <div className="field" style={{ margin: 0 }}>
        <label>Buy-system security</label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {SECURITY_CLASSES.map((cls) => (
            <label
              key={cls}
              style={{ display: 'flex', alignItems: 'center', gap: 8, margin: 0, textTransform: 'capitalize', letterSpacing: 'normal' }}
            >
              <input
                type="checkbox"
                style={{ width: 'auto' }}
                checked={filters.buySecurityClasses.includes(cls)}
                onChange={() => toggleSecurityClass('buySecurityClasses', cls)}
              />
              {cls}
            </label>
          ))}
        </div>
      </div>

      <div className="field" style={{ margin: 0 }}>
        <label>Sell-system security</label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {SECURITY_CLASSES.map((cls) => (
            <label
              key={cls}
              style={{ display: 'flex', alignItems: 'center', gap: 8, margin: 0, textTransform: 'capitalize', letterSpacing: 'normal' }}
            >
              <input
                type="checkbox"
                style={{ width: 'auto' }}
                checked={filters.sellSecurityClasses.includes(cls)}
                onChange={() => toggleSecurityClass('sellSecurityClasses', cls)}
              />
              {cls}
            </label>
          ))}
        </div>
      </div>

      <div className="field" style={{ margin: 0 }}>
        <label htmlFor="security-profile">Security</label>
        <select
          id="security-profile"
          value={filters.securityProfile}
          onChange={(e) => onChange({ ...filters, securityProfile: e.target.value as ArbitrageFilters['securityProfile'] })}
        >
          {SECURITY_PROFILE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      <LocationPicker systems={systems} selectedId={filters.fromSystemId} onChange={(id) => onChange({ ...filters, fromSystemId: id })} />

      {filters.fromSystemId !== null && (
        <div className="field" style={{ margin: 0 }}>
          <label>Max jumps from location</label>
          {numberField(filters.maxJumpsFromLocation, (v) => onChange({ ...filters, maxJumpsFromLocation: v }), 'Any')}
          <p className="field-help" style={{ margin: '6px 0 0' }}>
            Sort by "Distance" in the grid to rank opportunities by how close their buy system is to you, nearest first.
          </p>
        </div>
      )}

      <SystemPicker
        label="Buy system must be one of"
        systems={systems}
        selectedIds={filters.includeBuySystemIds}
        onChange={(ids) => onChange({ ...filters, includeBuySystemIds: ids })}
      />

      <SystemPicker
        label="Sell system must be one of"
        systems={systems}
        selectedIds={filters.includeSellSystemIds}
        onChange={(ids) => onChange({ ...filters, includeSellSystemIds: ids })}
      />

      <SystemPicker
        label="Exclude these systems"
        systems={systems}
        selectedIds={filters.excludeSystemIds}
        onChange={(ids) => onChange({ ...filters, excludeSystemIds: ids })}
      />

      <div className="field" style={{ margin: 0 }}>
        <label>Category{filters.categoryIds.length > 0 ? ` (${filters.categoryIds.length} selected)` : ''}</label>
        <div style={{ maxHeight: 180, overflowY: 'auto', border: '1px solid var(--border-dim)', padding: 8 }}>
          {categories.map((c) => (
            <label
              key={c.category_id}
              style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '0 0 6px', textTransform: 'none', letterSpacing: 'normal' }}
            >
              <input
                type="checkbox"
                style={{ width: 'auto' }}
                checked={filters.categoryIds.includes(c.category_id)}
                onChange={() => toggleCategory(c.category_id)}
              />
              {c.name}
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}
