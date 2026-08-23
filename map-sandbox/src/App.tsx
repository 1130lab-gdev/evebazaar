import { useState } from 'react';
import { MAP_API_BASE_URL } from './api/map/client';
import { EndpointExplorer } from './components/explorer/EndpointExplorer';
import { MapTab } from './components/map/MapTab';

type Tab = 'explorer' | 'map';

export default function App() {
  const [tab, setTab] = useState<Tab>('explorer');

  return (
    <div className="app-shell">
      <header className="app-header">
        <h1 className="app-title">Map API Sandbox</h1>
        <span className="mono text-muted">{MAP_API_BASE_URL}</span>
      </header>

      <nav className="tabs">
        <button className={`tab${tab === 'explorer' ? ' tab--active' : ''}`} onClick={() => setTab('explorer')}>
          Explorer
        </button>
        <button className={`tab${tab === 'map' ? ' tab--active' : ''}`} onClick={() => setTab('map')}>
          Map
        </button>
      </nav>

      {tab === 'explorer' && <EndpointExplorer />}
      {tab === 'map' && <MapTab />}
    </div>
  );
}
