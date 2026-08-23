import { useState } from 'react';
import type { FormEvent } from 'react';
import { useAuth } from '../../state/AuthContext';
import { Panel } from '../ui/Panel';

export function LoginForm() {
  const { status, error, login } = useAuth();
  const [username, setUsername] = useState('');
  const [apiKey, setApiKey] = useState('');

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !apiKey.trim()) return;
    void login(username.trim(), apiKey.trim());
  };

  return (
    <Panel title="Sign In">
      <p className="text-muted" style={{ fontSize: 13, lineHeight: 1.6, marginTop: 0 }}>
        Enter the character name and API key an admin issued you when your account was created. Kept in this
        browser only.
      </p>
      <form onSubmit={handleSubmit}>
        <div className="field">
          <label htmlFor="login-username">Character Name</label>
          <input
            id="login-username"
            type="text"
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="login-api-key">API Key</label>
          <input
            id="login-api-key"
            type="password"
            autoComplete="current-password"
            spellCheck={false}
            placeholder="paste your bearer token"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
          />
        </div>
        <button type="submit" className="btn btn--primary btn--full" disabled={status === 'verifying'}>
          {status === 'verifying' ? 'Signing in…' : 'Sign In'}
        </button>
        {error && (
          <p className="error-text" style={{ marginBottom: 0 }}>
            {error}
          </p>
        )}
      </form>
    </Panel>
  );
}
