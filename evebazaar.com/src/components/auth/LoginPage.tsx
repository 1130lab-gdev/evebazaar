import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../state/AuthContext';
import { LoginForm } from './LoginForm';

export function LoginPage() {
  const { status } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (status !== 'signed_in') return;
    const from = (location.state as { from?: Location } | null)?.from;
    navigate(from ? `${from.pathname}${from.search}` : '/', { replace: true });
  }, [status, navigate, location.state]);

  return (
    <section className="section" style={{ paddingTop: 140 }}>
      <div className="section-inner" style={{ maxWidth: 420 }}>
        <p className="eyebrow">Eve Bazaar // Sign In</p>
        <h2 className="section-heading" style={{ fontSize: 34, textAlign: 'left', color: '#eef4fa', marginBottom: 32 }}>
          Sign in to your account.
        </h2>
        <LoginForm />
      </div>
    </section>
  );
}
