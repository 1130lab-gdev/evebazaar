import { useState } from 'react';
import { useItemSearch } from '../../api/catalog/useItemSearch';
import type { SearchResult } from '../../api/catalog/types';

export function ItemSearchBox({ onSelect }: { onSelect: (item: SearchResult) => void }) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const { results, loading } = useItemSearch(query);

  function handleSelect(item: SearchResult) {
    onSelect(item);
    setQuery(item.name);
    setOpen(false);
  }

  return (
    <div style={{ position: 'relative' }}>
      <label htmlFor="item-search">Item</label>
      <input
        id="item-search"
        type="text"
        placeholder="Search for an item…"
        value={query}
        autoComplete="off"
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        // A plain onBlur would fire before the result button's onClick, so
        // the dropdown would close before the click registers -- deferred
        // just long enough for the click to land first.
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />
      {open && query.trim().length > 0 && (
        <div
          className="panel panel--tight"
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            zIndex: 10,
            marginTop: 4,
            maxHeight: 320,
            overflowY: 'auto',
          }}
        >
          {loading && (
            <p className="text-muted mono" style={{ fontSize: 12, margin: 0, padding: '4px 8px' }}>
              Searching…
            </p>
          )}
          {!loading && results.length === 0 && (
            <p className="text-muted mono" style={{ fontSize: 12, margin: 0, padding: '4px 8px' }}>
              No matches.
            </p>
          )}
          {results.map((r) => (
            <button
              key={r.type_id}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => handleSelect(r)}
              className="mono search-result-item"
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                background: 'none',
                border: 'none',
                color: 'var(--text-primary)',
                padding: '6px 8px',
                cursor: 'pointer',
                fontSize: 13,
              }}
            >
              {r.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
