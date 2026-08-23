export type RequestState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'done'; httpStatus: number; ok: boolean; elapsedMs: number; body: unknown }
  | { status: 'network-error'; message: string };

export function ResponsePanel({ state }: { state: RequestState }) {
  if (state.status === 'idle') return <p className="text-muted mono">Send a request to see the response.</p>;
  if (state.status === 'loading') return <p className="text-muted mono">loading...</p>;
  if (state.status === 'network-error') return <p className="error-text">{state.message}</p>;

  const { httpStatus, ok, elapsedMs, body } = state;
  return (
    <div>
      <div className={`status-line ${ok ? 'status-line--ok' : 'status-line--err'}`}>
        {httpStatus} {ok ? 'OK' : 'ERROR'} · {elapsedMs.toFixed(0)} ms
      </div>
      <pre className="json-viewer">{JSON.stringify(body, null, 2)}</pre>
    </div>
  );
}
