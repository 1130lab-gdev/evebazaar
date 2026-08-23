import { Link } from 'react-router-dom';
import { useAuth } from '../../state/AuthContext';
import type { UserRole } from '../../api/types';

export function SiteHeader() {
  const { status, username, role, signOut } = useAuth();

  // UX convenience only -- hides a link the caller's role can't use.
  // Shown while signed out (role unknown) so it stays discoverable; the
  // real boundary is RequireRole/the backend, not this.
  const visible = (roles: UserRole[]) => !role || role === 'admin' || roles.includes(role);

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
        <span
          style={{
            width: 10,
            height: 10,
            background: 'var(--accent-cyan)',
            clipPath: 'polygon(50% 0, 100% 50%, 50% 100%, 0 50%)',
            boxShadow: '0 0 10px var(--accent-cyan)',
          }}
        />
        Eve Bazaar
      </Link>

      <nav style={{ display: 'flex', alignItems: 'center', gap: 28 }}>
        {visible(['dispatcher']) && (
          <Link to="/route-planner" className="mono nav-link">
            Route Planner
          </Link>
        )}
        {visible(['freighter', 'dispatcher']) && (
          <Link to="/haulers" className="mono nav-link">
            Haulers
          </Link>
        )}
        {visible(['trader']) && (
          <Link to="/terminal" className="mono nav-link">
            Terminal
          </Link>
        )}
        {visible(['broker']) && (
          <Link to="/broker" className="mono nav-link">
            Broker Desk
          </Link>
        )}
        <Link to="/price-watches" className="mono nav-link">
          Price Watches
        </Link>
        {status === 'signed_in' ? (
          <span className="mono" style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 10 }}>
            Signed in as {username} ({role})
            <button
              onClick={signOut}
              className="mono nav-link"
              style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', font: 'inherit', letterSpacing: 'inherit' }}
            >
              Sign out
            </button>
          </span>
        ) : (
          <Link to="/login" className="mono nav-link">
            Sign In
          </Link>
        )}
      </nav>
    </header>
  );
}
