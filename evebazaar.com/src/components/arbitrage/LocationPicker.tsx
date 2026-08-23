import { useMemo, useState } from 'react';
import type { SystemSummary } from '../../api/map/types';

/**
 * Single-system picker for "where am I right now" -- same live-text-filter
 * approach as SystemPicker, but a single selected value with a clear
 * button instead of a multi-select chip list, since a trader only has one
 * current location.
 */
export function LocationPicker({
  systems,
  selectedId,
  onChange,
  label = 'From location',
}: {
  systems: SystemSummary[];
  selectedId: number | null;
  onChange: (next: number | null) => void;
  label?: string;
}) {
  const [query, setQuery] = useState('');

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    return systems.filter((s) => s.name.toLowerCase().includes(q)).slice(0, 15);
  }, [query, systems]);

  const selected = useMemo(() => (selectedId != null ? systems.find((s) => s.system_id === selectedId) : undefined), [selectedId, systems]);

  function select(systemId: number) {
    onChange(systemId);
    setQuery('');
  }

  return (
    <div className="field" style={{ margin: 0 }}>
      <label>{label}</label>
      {selected ? (
        <div
          className="mono"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            border: '1px solid var(--border-dim)',
            padding: '6px 8px',
            fontSize: 12,
          }}
        >
          {selected.name}
          <button
            type="button"
            onClick={() => onChange(null)}
            aria-label="clear location"
            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 0, fontSize: 13 }}
          >
            ×
          </button>
        </div>
      ) : (
        <input type="text" placeholder="type your current system…" value={query} onChange={(e) => setQuery(e.target.value)} />
      )}
      {!selected && matches.length > 0 && (
        <div style={{ marginTop: 4, border: '1px solid var(--border-dim)', maxHeight: 160, overflowY: 'auto' }}>
          {matches.map((s) => (
            <button
              key={s.system_id}
              type="button"
              onClick={() => select(s.system_id)}
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
    </div>
  );
}
