import { Link } from 'react-router-dom';

export function SiteHeader() {
  return (
    <header
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 50,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '18px 6vw',
        background: 'rgba(4, 6, 12, 0.85)',
        backdropFilter: 'blur(10px)',
        borderBottom: '1px solid var(--border-dim)',
      }}
    >
      <Link
        to="/route-planner"
        className="mono"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          textDecoration: 'none',
          color: 'var(--text-primary)',
          fontSize: 15,
          letterSpacing: '0.14em',
          textTransform: 'uppercase',
        }}
      >
        <img
          src="/favicon.svg"
          alt=""
          width={24}
          height={24}
          style={{ imageRendering: 'pixelated' }}
        />
        Eve Bazaar
      </Link>

      <nav style={{ display: 'flex', alignItems: 'center', gap: 28 }}>
        <Link to="/route-planner" className="mono nav-link">
          Trade Routes
        </Link>
        <Link to="/market" className="mono nav-link">
          Market Data
        </Link>
        <Link to="/map" className="mono nav-link">
          Galaxy Map
        </Link>
      </nav>
    </header>
  );
}
