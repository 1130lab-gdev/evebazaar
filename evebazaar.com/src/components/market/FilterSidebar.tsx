import type { OrderFilters, Region, SecurityClass } from '../../api/catalog/types';

const SECURITY_CLASSES: SecurityClass[] = ['highsec', 'lowsec', 'nullsec'];
const SIDES = [
  { value: 'buy' as const, label: 'Buy' },
  { value: 'sell' as const, label: 'Sell' },
  { value: null, label: 'Both' },
];

export function FilterSidebar({
  regions,
  filters,
  onChange,
}: {
  regions: Region[];
  filters: OrderFilters;
  onChange: (next: OrderFilters) => void;
}) {
  function toggleRegion(regionId: number) {
    const next = filters.regionIds.includes(regionId)
      ? filters.regionIds.filter((id) => id !== regionId)
      : [...filters.regionIds, regionId];
    onChange({ ...filters, regionIds: next });
  }

  function toggleSecurityClass(cls: SecurityClass) {
    const next = filters.securityClasses.includes(cls)
      ? filters.securityClasses.filter((c) => c !== cls)
      : [...filters.securityClasses, cls];
    onChange({ ...filters, securityClasses: next });
  }

  return (
    <div className="panel panel--tight" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div className="field" style={{ margin: 0 }}>
        <label>Side</label>
        <div style={{ display: 'flex', gap: 8 }}>
          {SIDES.map(({ value, label }) => (
            <button
              key={label}
              type="button"
              className="btn"
              style={{
                flex: 1,
                padding: '9px 0',
                ...(filters.side === value ? { borderColor: 'var(--accent-cyan)', color: 'var(--accent-cyan)' } : {}),
              }}
              onClick={() => onChange({ ...filters, side: value })}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="field" style={{ margin: 0 }}>
        <label>Price range (ISK)</label>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            type="number"
            placeholder="Min"
            value={filters.minPrice ?? ''}
            onChange={(e) => onChange({ ...filters, minPrice: e.target.value === '' ? null : Number(e.target.value) })}
          />
          <input
            type="number"
            placeholder="Max"
            value={filters.maxPrice ?? ''}
            onChange={(e) => onChange({ ...filters, maxPrice: e.target.value === '' ? null : Number(e.target.value) })}
          />
        </div>
      </div>

      <div className="field" style={{ margin: 0 }}>
        <label>Min quantity remaining</label>
        <input
          type="number"
          placeholder="Any"
          value={filters.minQty ?? ''}
          onChange={(e) => onChange({ ...filters, minQty: e.target.value === '' ? null : Number(e.target.value) })}
        />
      </div>

      <div className="field" style={{ margin: 0 }}>
        <label>Security class</label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {SECURITY_CLASSES.map((cls) => (
            <label
              key={cls}
              style={{ display: 'flex', alignItems: 'center', gap: 8, margin: 0, textTransform: 'capitalize', letterSpacing: 'normal' }}
            >
              <input type="checkbox" style={{ width: 'auto' }} checked={filters.securityClasses.includes(cls)} onChange={() => toggleSecurityClass(cls)} />
              {cls}
            </label>
          ))}
        </div>
      </div>

      <div className="field" style={{ margin: 0 }}>
        <label>Regions{filters.regionIds.length > 0 ? ` (${filters.regionIds.length} selected)` : ''}</label>
        <div style={{ maxHeight: 220, overflowY: 'auto', border: '1px solid var(--border-dim)', padding: 8 }}>
          {regions.map((r) => (
            <label
              key={r.region_id}
              style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '0 0 6px', textTransform: 'none', letterSpacing: 'normal' }}
            >
              <input type="checkbox" style={{ width: 'auto' }} checked={filters.regionIds.includes(r.region_id)} onChange={() => toggleRegion(r.region_id)} />
              {r.name}
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}
