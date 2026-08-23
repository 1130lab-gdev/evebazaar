import { useState } from 'react';
import { BrowseMap } from './BrowseMap';
import { GalaxyMap } from './GalaxyMap';
import { RoutePlanner } from './RoutePlanner';

type SubTab = 'browse' | 'galaxy' | 'route';

export function MapTab() {
  const [subTab, setSubTab] = useState<SubTab>('browse');
  const [sourceSystemId, setSourceSystemId] = useState<number | null>(null);
  const [targetSystemId, setTargetSystemId] = useState<number | null>(null);

  function routeFrom(id: number) {
    setSourceSystemId(id);
    setSubTab('route');
  }

  function routeTo(id: number) {
    setTargetSystemId(id);
    setSubTab('route');
  }

  return (
    <div>
      <nav className="tabs tabs--sub">
        <button className={`tab${subTab === 'browse' ? ' tab--active' : ''}`} onClick={() => setSubTab('browse')}>
          Browse
        </button>
        <button className={`tab${subTab === 'galaxy' ? ' tab--active' : ''}`} onClick={() => setSubTab('galaxy')}>
          Galaxy
        </button>
        <button className={`tab${subTab === 'route' ? ' tab--active' : ''}`} onClick={() => setSubTab('route')}>
          Route Planner
        </button>
      </nav>

      {subTab === 'browse' && <BrowseMap onRouteFrom={routeFrom} onRouteTo={routeTo} />}
      {subTab === 'galaxy' && <GalaxyMap />}
      {subTab === 'route' && (
        <RoutePlanner
          sourceSystemId={sourceSystemId}
          targetSystemId={targetSystemId}
          onSourceChange={setSourceSystemId}
          onTargetChange={setTargetSystemId}
        />
      )}
    </div>
  );
}
