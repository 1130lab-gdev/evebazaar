import { useMemo, useState } from 'react';
import { useRegions } from '../../api/map/useRegions';
import { useConstellations } from '../../api/map/useConstellations';
import { useSystems } from '../../api/map/useSystems';
import { useStargates } from '../../api/map/useStargates';
import { useSystemActivity } from '../../api/map/useSystemActivity';
import type { SystemSummary } from '../../api/map/types';
import { useGalaxyLayout } from './useGalaxyLayout';
import { useSchematicLayout } from './useSchematicLayout';
import { MapCanvas, type MapEdge } from './MapCanvas';
import { SecurityLegend } from './SecurityLegend';
import { securityColor } from '../../lib/securityColor';
import { formatSecStatus } from '../../lib/format';

type ViewMode = 'galaxy' | 'schematic';

interface Props {
  onRouteFrom: (systemId: number) => void;
  onRouteTo: (systemId: number) => void;
}

export function BrowseMap({ onRouteFrom, onRouteTo }: Props) {
  const [regionId, setRegionId] = useState<number | undefined>(undefined);
  const [constellationId, setConstellationId] = useState<number | undefined>(undefined);
  const [mode, setMode] = useState<ViewMode>('schematic');

  const { regions } = useRegions();
  const { constellations } = useConstellations(regionId);

  return (
    <div className="map-layout">
      <div className="panel panel--tight map-controls">
        <div className="field">
          <label htmlFor="browse-region">region</label>
          <select
            id="browse-region"
            value={regionId ?? ''}
            onChange={(e) => {
              setRegionId(e.target.value ? Number(e.target.value) : undefined);
              setConstellationId(undefined);
            }}
          >
            <option value="">(pick a region)</option>
            {regions.map((r) => (
              <option key={r.region_id} value={r.region_id}>
                {r.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="browse-constellation">constellation</label>
          <select
            id="browse-constellation"
            value={constellationId ?? ''}
            disabled={!regionId}
            onChange={(e) => setConstellationId(e.target.value ? Number(e.target.value) : undefined)}
          >
            <option value="">(all)</option>
            {constellations.map((c) => (
              <option key={c.constellation_id} value={c.constellation_id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>view</label>
          <div className="map-mode-toggle">
            <button className={`btn${mode === 'galaxy' ? ' btn--primary' : ''}`} onClick={() => setMode('galaxy')}>
              Galaxy (true position)
            </button>
            <button className={`btn${mode === 'schematic' ? ' btn--primary' : ''}`} onClick={() => setMode('schematic')}>
              Schematic (force layout)
            </button>
          </div>
        </div>
        <SecurityLegend />
      </div>

      {regionId ? (
        // Split into a child component (rather than an `if` inside this
        // one) so the data hooks below are never called with an unfiltered
        // region_id -- that would mean fetching every system/stargate in
        // New Eden on mount, before the user has picked anything.
        <BrowseMapData
          key={`${regionId}:${constellationId ?? 'all'}`}
          regionId={regionId}
          constellationId={constellationId}
          mode={mode}
          onRouteFrom={onRouteFrom}
          onRouteTo={onRouteTo}
        />
      ) : (
        <>
          <div className="panel map-canvas-panel">
            <p className="text-muted mono">Pick a region to load its systems.</p>
          </div>
          <div className="panel panel--tight map-detail">
            <div className="panel-header">
              <h2 className="panel-title">Selected system</h2>
            </div>
            <p className="text-muted mono">Click a system on the map.</p>
          </div>
        </>
      )}
    </div>
  );
}

interface DataProps {
  regionId: number;
  constellationId: number | undefined;
  mode: ViewMode;
  onRouteFrom: (systemId: number) => void;
  onRouteTo: (systemId: number) => void;
}

function BrowseMapData({ regionId, constellationId, mode, onRouteFrom, onRouteTo }: DataProps) {
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const { systems, loading: systemsLoading } = useSystems(regionId, constellationId);
  const { stargates } = useStargates({ regionId, constellationId });
  const { activity } = useSystemActivity({ regionId, constellationId });

  // collideRadius=7 matches SystemNode's activity-scaled radius closely
  // enough in practice (4-10) to keep dots visually distinct even in a
  // dense constellation.
  const galaxyPositions = useGalaxyLayout(systems, 0, 7);
  const schematicPositions = useSchematicLayout(systems, stargates);
  const positions = mode === 'galaxy' ? galaxyPositions : schematicPositions;

  const activityBySystem = useMemo(
    () => new Map(activity.map((a): [number, (typeof activity)[number]] => [a.system_id, a])),
    [activity],
  );

  const edges = useMemo<MapEdge[]>(() => {
    const seen = new Set<string>();
    const list: MapEdge[] = [];
    for (const gate of stargates) {
      const from = positions.get(gate.system_id);
      const to = positions.get(gate.destination_system_id);
      if (!from || !to) continue;
      const key = [gate.system_id, gate.destination_system_id].sort((a, b) => a - b).join('-');
      if (seen.has(key)) continue;
      seen.add(key);
      list.push({ key, from, to });
    }
    return list;
  }, [stargates, positions]);

  const selected: SystemSummary | undefined = selectedId != null ? systems.find((s) => s.system_id === selectedId) : undefined;

  return (
    <>
      <div className="panel map-canvas-panel">
        {systemsLoading ? (
          <p className="text-muted mono">loading systems…</p>
        ) : (
          <MapCanvas
            systems={systems}
            positions={positions}
            edges={edges}
            activityBySystem={activityBySystem}
            selectedSystemId={selectedId}
            onSystemClick={setSelectedId}
          />
        )}
      </div>

      <div className="panel panel--tight map-detail">
        <div className="panel-header">
          <h2 className="panel-title">Selected system</h2>
        </div>
        {!selected && <p className="text-muted mono">Click a system on the map.</p>}
        {selected && (
          <div>
            <p className="mono" style={{ color: securityColor(selected.security_status) }}>
              {formatSecStatus(selected.security_status)} sec
            </p>
            <p>{selected.name}</p>
            <p className="text-muted mono">system_id {selected.system_id}</p>
            <div className="map-detail-actions">
              <button className="btn" onClick={() => onRouteFrom(selected.system_id)}>
                Route from here
              </button>
              <button className="btn" onClick={() => onRouteTo(selected.system_id)}>
                Route to here
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
