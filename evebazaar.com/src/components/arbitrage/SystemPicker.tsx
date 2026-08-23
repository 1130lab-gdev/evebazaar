import { useMemo, useState } from 'react';
import type { SystemSummary } from '../../api/map/types';

/**
 * A searchable add/remove list for system ids -- shared by the arbitrage
 * filter panel's include and exclude pickers. Systems number in the
 * thousands, so this is a live text filter over the already-fetched list
 * (same approach as GalaxyMap's own system search) rather than a raw
 * multi-select.
 */
export function SystemPicker({
  label,
  systems,
  selectedIds,
  onChange,
}: {
  label: string;
  systems: SystemSummary[];
  selectedIds: number[];
  onChange: (next: number[]) => void;
}) {
  const [query, setQuery] = useState('');

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    return systems.filter((s) => s.name.toLowerCase().includes(q) && !selectedIds.includes(s.system_id)).slice(0, 15);
  }, [query, systems, selectedIds]);

  const selectedSystems = useMemo(
    () => selectedIds.map((id) => systems.find((s) => s.system_id === id)).filter((s): s is SystemSummary => s != null),
    [selectedIds, systems],
  );

  function add(systemId: number) {
    onChange([...selectedIds, systemId]);
    setQuery('');
  }

  function remove(systemId: number) {
    onChange(selectedIds.filter((id) => id !== systemId));
  }

  return (
    <div className="field" style={{ margin: 0 }}>
      <label>
        {label}
        {selectedIds.length > 0 ? ` (${selectedIds.length})` : ''}
      </label>
      <input type="text" placeholder="type a system name…" value={query} onChange={(e) => setQuery(e.target.value)} />
      {matches.length > 0 && (
        <div style={{ marginTop: 4, border: '1px solid var(--border-dim)', maxHeight: 160, overflowY: 'auto' }}>
          {matches.map((s) => (
            <button
              key={s.system_id}
              type="button"
              onClick={() => add(s.system_id)}
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                background: 'none',
                border: 'none',
                color: 'var(--text-primary)',
                fontSize: 12,
                padding: '5px 8px',
                cursor: 'pointer',
              }}
            >
              {s.name}
            </button>
          ))}
        </div>
      )}
      {selectedSystems.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
          {selectedSystems.map((s) => (
            <span
              key={s.system_id}
              className="mono"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                fontSize: 11,
                border: '1px solid var(--border-dim)',
                padding: '3px 6px',
              }}
            >
              {s.name}
              <button
                type="button"
                onClick={() => remove(s.system_id)}
                aria-label={`remove ${s.name}`}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 0, fontSize: 12 }}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
