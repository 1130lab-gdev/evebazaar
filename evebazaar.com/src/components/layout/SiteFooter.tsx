export function SiteFooter() {
  return (
    <footer
      style={{
        borderTop: '1px solid var(--border-dim)',
        padding: '32px 6vw',
        display: 'flex',
        flexWrap: 'wrap',
        gap: 16,
        alignItems: 'center',
        justifyContent: 'space-between',
      }}
    >
      <span className="mono text-muted" style={{ fontSize: 12, letterSpacing: '0.08em' }}>
        EVE BAZAAR — ARBITRAGE SCANNER &amp; ROUTE PLANNER
      </span>
      <span className="mono text-muted" style={{ fontSize: 12 }}>
        Not affiliated with CCP Games. EVE Online is a trademark of CCP hf.
      </span>
    </footer>
  );
}
