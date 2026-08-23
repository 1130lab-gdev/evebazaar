import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../state/AuthContext';
import type { UserRole } from '../../api/types';

/**
 * Gates a route behind sign-in + role. This is a UX convenience, not the
 * real security boundary -- every gated endpoint enforces the same role
 * check server-side (exchange-webapi/catalog-api), so a request forged
 * around this component still gets rejected.
 */
export function RequireRole({ roles, children }: { roles: UserRole[]; children: ReactNode }) {
  const { status, role } = useAuth();
  const location = useLocation();

  if (status !== 'signed_in') {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }
  if (role !== 'admin' && (!role || !roles.includes(role))) {
    // Not "/" -- that redirects to the (role-gated) route planner, which
    // would bounce right back here for anyone who isn't a dispatcher.
    // Price Watches is the one route every signed-in role can land on.
    return <Navigate to="/price-watches" replace />;
  }
  return <>{children}</>;
}
