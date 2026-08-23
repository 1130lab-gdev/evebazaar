import { useMemo, useState } from 'react';
import { useRoute } from '../../api/map/useRoute';
import { useSystemsByIds } from '../../api/map/useSystemsByIds';
import type { RouteParams, RouteProfile } from '../../api/map/types';
import { useGalaxyLayout } from './useGalaxyLayout';
import { MapCanvas } from './MapCanvas';
import { securityColor } from '../../lib/securityColor';
import { formatDuration, formatSecStatus } from '../../lib/format';

interface Props {
  sourceSystemId: number | null;
  targetSystemId: number | null;
  onSourceChange: (id: number | null) => void;
  onTargetChange: (id: number | null) => void;
}

export function RoutePlanner({ sourceSystemId, targetSystemId, onSourceChange, onTargetChange }: Props) {
  const [warpSpeed, setWarpSpeed] = useState('');
  const [profile, setProfile] = useState<RouteProfile | ''>('');

  const params: RouteParams | null =
    sourceSystemId != null && targetSystemId != null
      ? {
          source_system_id: sourceSystemId,
          target_system_id: targetSystemId,
          warp_speed_au_s: warpSpeed ? Number(warpSpeed) : undefined,
          profile: profile || undefined,
        }
      : null;

  const { route, loading, error } = useRoute(params);

  const systemIds = useMemo(() => route?.systems.map((s) => s.system_id) ?? [], [route]);
  const { systemsById, loading: positionsLoading } = useSystemsByIds(systemIds);

  const systems = useMemo(
    () =>
      systemIds
        .map((id) => systemsById.get(id))
        .filter((s): s is NonNullable<typeof s> => Boolean(s)),
    [systemIds, systemsById],
  );
  const positions = useGalaxyLayout(systems, 0, 7);

  return (
    <div className="map-layout">
      <div className="panel panel--tight map-controls">
        <div className="field">
          <label htmlFor="route-source">source_system_id</label>
          <input
            id="route-source"
            type="number"
            value={sourceSystemId ?? ''}
            onChange={(e) => onSourceChange(e.target.value ? Number(e.target.value) : null)}
            placeholder="pick in Browse, or type an id"
          />
        </div>
        <div className="field">
          <label htmlFor="route-target">target_system_id</label>
          <input
            id="route-target"
            type="number"
            value={targetSystemId ?? ''}
            onChange={(e) => onTargetChange(e.target.value ? Number(e.target.value) : null)}
          />
        </div>
        <div className="field">
          <label htmlFor="route-profile">profile</label>
          <select id="route-profile" value={profile} onChange={(e) => setProfile(e.target.value as RouteProfile | '')}>
            <option value="">fastest (default)</option>
            <option value="high_sec_only">high_sec_only</option>
            <option value="low_sec_plus">low_sec_plus</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="route-warp">warp_speed_au_s</label>
          <input
            id="route-warp"
            type="number"
            step="any"
            value={warpSpeed}
            onChange={(e) => setWarpSpeed(e.target.value)}
            placeholder="default 3.0"
          />
        </div>
      </div>

      <div className="panel map-canvas-panel">
        {!params && <p className="text-muted mono">Pick a source and target system.</p>}
        {params && (loading || positionsLoading) && <p className="text-muted mono">computing route…</p>}
        {params && error && <p className="error-text">{error}</p>}
        {params && route && !loading && !positionsLoading && (
          <MapCanvas systems={systems} positions={positions} edges={[]} routeLegs={route.legs} height={560} />
        )}
      </div>

      <div className="panel panel--tight map-detail">
        <div className="panel-header">
          <h2 className="panel-title">Route</h2>
        </div>
        {!route && <p className="text-muted mono">No route computed yet.</p>}
        {route && (
          <div>
            <p className="mono">
              {route.total_jumps} jumps · {formatDuration(route.total_time_s)}
            </p>
            <div className="route-stops">
              {route.systems.map((s) => (
                <div key={s.system_id} className="route-stop">
                  <span className="mono" style={{ color: securityColor(s.security_status) }}>
                    {formatSecStatus(s.security_status)}
                  </span>
                  <span>{s.name}</span>
                  {s.stations.length > 0 && <span className="text-muted mono">{s.stations.length} station(s)</span>}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
