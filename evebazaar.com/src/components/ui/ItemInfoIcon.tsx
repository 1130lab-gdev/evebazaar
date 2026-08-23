import { forwardRef, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTypeDetail } from '../../api/catalog/useTypeDetail';
import { formatQty, formatVolume } from '../../lib/format';

const POPOVER_WIDTH = 280;

/** ESI item descriptions embed raw `<a href=showinfo:...>name</a>`-style
 * markup (EVE client in-game link syntax, not real HTML) -- stripped here
 * rather than rendered, since neither React's plain-text escaping (which
 * would show the literal tags) nor `dangerouslySetInnerHTML` (which would
 * both be pointless, since `showinfo:` isn't a real URL scheme a browser
 * can follow, and needlessly risky for content that isn't rendered as
 * markup anywhere else in the app) makes sense here -- keeping the tag's
 * inner text and dropping the wrapper is what actually reads well. */
function stripMarkup(text: string): string {
  return text.replace(/<[^>]+>/g, '');
}

/** Small circled-"i" button that pops up an item's description/category/
 * volume/mass on click -- meant to sit right next to any item name
 * wherever one's rendered (route planner legs, saved run legs, the
 * arbitrage grid, ...). Portaled to `document.body` and positioned via
 * `getBoundingClientRect` rather than a plain `position: absolute`
 * ancestor-relative popover, since every current call site lives inside
 * an `overflow: auto`/`overflow-x: auto` scroll container that would
 * otherwise clip it. */
export function ItemInfoIcon({ typeId, typeName }: { typeId: number; typeName?: string }) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  function toggle(e: React.MouseEvent) {
    e.stopPropagation();
    if (!open && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      const left = Math.min(Math.max(12, rect.left), window.innerWidth - POPOVER_WIDTH - 12);
      setCoords({ top: rect.bottom + 6, left });
    }
    setOpen((o) => !o);
  }

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(e: MouseEvent) {
      const target = e.target as Node;
      if (buttonRef.current?.contains(target) || popoverRef.current?.contains(target)) return;
      setOpen(false);
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    // Capture phase: the scroll that should dismiss this can happen inside
    // any ancestor's own overflow container, not just the window, and
    // those don't bubble a 'scroll' event up to `document`.
    function handleScroll() {
      setOpen(false);
    }

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('scroll', handleScroll, true);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('scroll', handleScroll, true);
    };
  }, [open]);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={toggle}
        aria-label={`Item info${typeName ? ` -- ${typeName}` : ''}`}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 15,
          height: 15,
          marginLeft: 6,
          padding: 0,
          background: 'none',
          border: 'none',
          borderRadius: '50%',
          color: open ? 'var(--accent-cyan)' : 'var(--text-faint)',
          cursor: 'pointer',
          verticalAlign: 'middle',
        }}
      >
        <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.3" />
          <circle cx="8" cy="4.7" r="0.9" fill="currentColor" />
          <rect x="7.25" y="7" width="1.5" height="5" rx="0.5" fill="currentColor" />
        </svg>
      </button>
      {open &&
        coords &&
        createPortal(<ItemInfoPopover ref={popoverRef} typeId={typeId} coords={coords} onClose={() => setOpen(false)} />, document.body)}
    </>
  );
}

const ItemInfoPopover = forwardRef<HTMLDivElement, { typeId: number; coords: { top: number; left: number }; onClose: () => void }>(
  function ItemInfoPopover({ typeId, coords, onClose }, ref) {
    const { type, loading, error } = useTypeDetail(typeId);

    return (
      <div
        ref={ref}
        className="panel panel--tight"
        style={{
          position: 'fixed',
          top: coords.top,
          left: coords.left,
          zIndex: 1000,
          width: POPOVER_WIDTH,
          maxWidth: 'calc(100vw - 24px)',
          padding: 12,
          boxShadow: '0 12px 32px rgba(0, 0, 0, 0.6)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
          <strong style={{ fontSize: 13 }}>{loading ? 'Loading…' : (type?.name ?? 'Item info')}</strong>
          <button
            type="button"
            onClick={onClose}
            aria-label="close"
            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 0, fontSize: 15, lineHeight: 1 }}
          >
            ×
          </button>
        </div>
        {error && (
          <p className="error-text" style={{ margin: '8px 0 0', fontSize: 12 }}>
            {error}
          </p>
        )}
        {type && (
          <>
            <p className="text-muted mono" style={{ margin: '4px 0 8px', fontSize: 11 }}>
              {type.category_name} · {type.group_name}
            </p>
            {type.description && (
              <p
                style={{
                  margin: '0 0 8px',
                  fontSize: 12,
                  color: 'var(--text-primary)',
                  maxHeight: 120,
                  overflowY: 'auto',
                  whiteSpace: 'pre-wrap',
                }}
              >
                {stripMarkup(type.description)}
              </p>
            )}
            <div className="mono text-muted" style={{ fontSize: 11, display: 'flex', flexDirection: 'column', gap: 2 }}>
              {type.packaged_volume !== null && <span>Packaged volume: {formatVolume(type.packaged_volume)}</span>}
              {type.volume !== null && type.volume !== type.packaged_volume && <span>Volume: {formatVolume(type.volume)}</span>}
              {type.mass !== null && <span>Mass: {formatQty(Math.round(type.mass))} kg</span>}
            </div>
          </>
        )}
      </div>
    );
  },
);
