import { useState } from 'react';
import type { FormEvent } from 'react';
import { Panel } from '../ui/Panel';
import { ApiError } from '../../api/client';
import type { CreateTraderResponse } from '../../api/types';

export function CreateTraderForm({ onCreate }: { onCreate: (username: string) => Promise<CreateTraderResponse> }) {
  const [username, setUsername] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<CreateTraderResponse | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!username.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const trader = await onCreate(username.trim());
      setCreated(trader);
      setUsername('');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to create the trader account.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Panel title="New Trader Account">
      <p className="text-muted" style={{ fontSize: 13, lineHeight: 1.6, marginTop: 0 }}>
        Creates a trader account under your book -- you'll be able to see and manage its orders below. The API key
        is shown once; hand it to the character it belongs to.
      </p>
      <form onSubmit={(e) => void handleSubmit(e)}>
        <div className="field">
          <label htmlFor="trader-username">Character Name</label>
          <input id="trader-username" type="text" value={username} onChange={(e) => setUsername(e.target.value)} />
        </div>
        <button type="submit" className="btn btn--primary btn--full" disabled={submitting}>
          {submitting ? 'Creating…' : 'Create Trader'}
        </button>
        {error && (
          <p className="error-text" style={{ marginBottom: 0, marginTop: 12 }}>
            {error}
          </p>
        )}
      </form>

      {created && (
        <div style={{ marginTop: 16, padding: 12, border: '1px solid var(--accent-green)', background: 'rgba(57, 255, 201, 0.08)' }}>
          <p className="mono" style={{ fontSize: 12, color: 'var(--accent-green)', margin: '0 0 8px' }}>
            {created.username} -- shown once, copy it now:
          </p>
          <p className="mono" style={{ fontSize: 12, wordBreak: 'break-all', margin: 0 }}>
            {created.api_key}
          </p>
        </div>
      )}
    </Panel>
  );
}
