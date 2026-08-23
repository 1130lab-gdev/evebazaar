import { useState } from 'react';
import { mapRequestRaw } from '../../api/map/client';
import { ENDPOINTS } from './endpoints';
import { RequestForm } from './RequestForm';
import { ResponsePanel, type RequestState } from './ResponsePanel';

export function EndpointExplorer() {
  const [endpointId, setEndpointId] = useState(ENDPOINTS[0].id);
  const [values, setValues] = useState<Record<string, string>>({});
  const [state, setState] = useState<RequestState>({ status: 'idle' });

  const endpoint = ENDPOINTS.find((e) => e.id === endpointId) ?? ENDPOINTS[0];
  const missingRequired = endpoint.fields.some((f) => f.required && !values[f.name]);

  function selectEndpoint(id: string) {
    setEndpointId(id);
    setValues({});
    setState({ status: 'idle' });
  }

  async function send() {
    const path = endpoint.buildPath(values);
    setState({ status: 'loading' });
    try {
      const res = await mapRequestRaw(path);
      setState({ status: 'done', httpStatus: res.status, ok: res.ok, elapsedMs: res.elapsedMs, body: res.body });
    } catch (err) {
      setState({ status: 'network-error', message: err instanceof Error ? err.message : 'Request failed.' });
    }
  }

  return (
    <div className="explorer-grid">
      <div className="panel panel--tight">
        <div className="panel-header">
          <h2 className="panel-title">Endpoints</h2>
        </div>
        <div className="endpoint-list">
          {ENDPOINTS.map((e) => (
            <button
              key={e.id}
              className={`endpoint-item${e.id === endpointId ? ' endpoint-item--active' : ''}`}
              onClick={() => selectEndpoint(e.id)}
            >
              {e.label}
            </button>
          ))}
        </div>
      </div>

      <div className="panel">
        <div className="panel-header">
          <h2 className="panel-title">{endpoint.label}</h2>
        </div>
        <p className="field-help">{endpoint.description}</p>
        <RequestForm endpoint={endpoint} values={values} onChange={(name, value) => setValues((prev) => ({ ...prev, [name]: value }))} />
        <button className="btn btn--primary" disabled={missingRequired || state.status === 'loading'} onClick={send}>
          {state.status === 'loading' ? 'Sending…' : 'Send'}
        </button>
        {missingRequired && <p className="error-text field-error">Fill required fields (*) first.</p>}
      </div>

      <div className="panel">
        <div className="panel-header">
          <h2 className="panel-title">Response</h2>
        </div>
        <ResponsePanel state={state} />
      </div>
    </div>
  );
}
