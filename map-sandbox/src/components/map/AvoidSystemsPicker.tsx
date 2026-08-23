import { useMemo, useState } from 'react';
import type { SystemSummary } from '../../api/map/types';

/**
 * Searchable add/remove list for the route's `avoid_system_id` set --
 * same live-text-filter-over-already-fetched-systems approach as the
 * "find system" search box above the map, just scoped to picking several
 * systems to route around instead of one to jump to.
 */
export function AvoidSystemsPicker({
  systems,
  systemName,
  avoidIds,
  onChange,
}: {
  systems: SystemSummary[];
  systemName: Map<number, string>;
  avoidIds: number[];
  onChange: (next: number[]) => void;
}) {
  const [query, setQuery] = useState('');

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    return systems.filter((s) => s.name.toLowerCase().includes(q) && !avoidIds.includes(s.system_id)).slice(0, 10);
  }, [query, systems, avoidIds]);

  function add(systemId: number) {
    onChange([...avoidIds, systemId]);
    setQuery('');
  }

  function remove(systemId: number) {
    onChange(avoidIds.filter((id) => id !== systemId));
  }

  return (
    <div className="field">
      <label htmlFor="avoid-search">avoid systems{avoidIds.length > 0 ? ` (${avoidIds.length})` : ''}</label>
      <input id="avoid-search" type="text" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="type a name…" />
      {matches.length > 0 && (
        <div className="galaxy-search-results">
          {matches.map((s) => (
            <button key={s.system_id} type="button" className="galaxy-search-result" onClick={() => add(s.system_id)}>
              {s.name}
            </button>
          ))}
        </div>
      )}
      {avoidIds.length > 0 && (
        <div className="avoid-chip-list">
          {avoidIds.map((id) => (
            <span key={id} className="avoid-chip mono">
              {systemName.get(id) ?? id}
              <button type="button" className="avoid-chip-remove" aria-label={`stop avoiding ${systemName.get(id) ?? id}`} onClick={() => remove(id)}>
                ×
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
