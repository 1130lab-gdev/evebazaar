import type { PinnedItem } from '../../lib/pinnedItems';

export function PinnedItems({
  items,
  activeTypeId,
  onSelect,
  onRemove,
}: {
  items: PinnedItem[];
  activeTypeId: number | null;
  onSelect: (typeId: number) => void;
  onRemove: (typeId: number) => void;
}) {
  if (items.length === 0) return null;
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
      {items.map((item) => (
        <span
          key={item.typeId}
          className="mono"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 12,
            padding: '4px 6px 4px 10px',
            border: '1px solid var(--border-dim)',
            ...(item.typeId === activeTypeId ? { borderColor: 'var(--accent-cyan)', color: 'var(--accent-cyan)' } : {}),
          }}
        >
          <button
            type="button"
            onClick={() => onSelect(item.typeId)}
            style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', font: 'inherit', color: 'inherit' }}
          >
            {item.name}
          </button>
          <button
            type="button"
            aria-label={`Unpin ${item.name}`}
            onClick={() => onRemove(item.typeId)}
            style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--text-muted)', lineHeight: 1 }}
          >
            ✕
          </button>
        </span>
      ))}
    </div>
  );
}
