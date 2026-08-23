import { useEffect, useMemo, useState } from 'react';
import { useRegions } from '../../api/map/useRegions';
import { useSystems } from '../../api/map/useSystems';
import { useStargates } from '../../api/map/useStargates';
import { useStargateDistances } from '../../api/map/useStargateDistances';
import { useSystemActivity } from '../../api/map/useSystemActivity';
import { useRoute } from '../../api/map/useRoute';
import type { RouteProfile, RouteResponse, SystemSummary } from '../../api/map/types';
import { useGalaxyPositions3D } from '../map3d/useGalaxyPositions3D';
import { GalaxyScene3D, type Hovered3D } from '../map3d/GalaxyScene3D';
import type { Edge3D } from '../map3d/JumpLines';
import { SecurityLegend } from './SecurityLegend';
import { AvoidSystemsPicker } from './AvoidSystemsPicker';
import { securityColor } from '../../lib/securityColor';
import { formatDistance, formatDuration, formatSecStatus } from '../../lib/format';
import { isWormholeSystem } from '../../lib/isWormholeSystem';
import { factionForRegion } from '../../lib/factions';
import { sanitizeLoreHtml } from '../../lib/sanitizeLoreHtml';
import './GalaxyMap.css';

/**
 * Every k-space system at once, plotted at its true 3D galactic position
 * -- no flattening onto a 2D plane, so none of the layout machinery the
 * earlier 2D views needed (percentile clipping, region/faction grouping,
 * collision-avoidance) applies here. A free 3D camera solves the "dense
 * cluster is unreadable" problem the 2D views fought by flying closer,
 * not by distorting positions to fit a flat canvas.
 *
 * Portable by design -- this is meant to be lifted into another app (e.g.
 * evebazaar.com) as-is. What a host app needs to provide:
 *  - Peer deps: three, @react-three/fiber, @react-three/drei (see this
 *    sandbox's package.json for the versions this was built/tested against).
 *  - `VITE_MAP_API_BASE_URL` (or equivalent for the host's bundler) pointing
 *    at a running map-api instance -- see ../../api/map/client.ts.
 *  - The CSS custom properties this component's styling reads (--bg-void,
 *    --bg-panel, --bg-raised, --border-dim, --border-bright, --accent-cyan,
 *    --accent-green, --accent-amber, --accent-red, --text-primary,
 *    --text-muted, --text-faint, --font-mono) plus the shared `.panel`,
 *    `.panel--tight`, `.panel-header`, `.panel-title`, `.btn`, `.field`,
 *    `.field-help`, `.text-muted`, `.mono`, `.error-text` primitives --
 *    all currently defined in this sandbox's index.css, sourced originally
 *    from evebazaar.com's own theme. GalaxyMap.css (imported above) only
 *    carries the rules specific to this component's own markup.
 *
 * Extension points for a future market-data integration: `onSelectedSystemChange`
 * fires whenever the inspected system changes (null on deselect), and
 * `onRouteChange` fires whenever the computed route changes (null while none
 * is active) -- both are fire-and-forget, read-only hooks for a host to key
 * a market panel off of; nothing here depends on them being provided.
 * `focusRoute` is the inverse direction -- a host (e.g. an arbitrage grid)
 * can drive the map to a specific source/target pair by changing this prop.
 * It's an initial-value nudge, not a fully controlled input: seeded into
 * the map's own route state on change, then left free for the user to
 * adjust from there (clearing the route, picking a different target, etc.)
 * without fighting a parent that still thinks it owns the value.
 */
export interface GalaxyMapProps {
  onSelectedSystemChange?: (system: SystemSummary | null) => void;
  onRouteChange?: (route: RouteResponse | null) => void;
  focusRoute?: { sourceSystemId: number; targetSystemId: number } | null;
}

export function GalaxyMap({ onSelectedSystemChange, onRouteChange, focusRoute }: GalaxyMapProps = {}) {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [hoveredId, setHoveredId] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [routeSourceId, setRouteSourceId] = useState<number | null>(null);
  const [routeTargetId, setRouteTargetId] = useState<number | null>(null);
  const [resetSignal, setResetSignal] = useState(0);
  const [routeProfile, setRouteProfile] = useState<RouteProfile | ''>('');
  const [warpSpeed, setWarpSpeed] = useState('');
  const [highsecMult, setHighsecMult] = useState('');
  const [lowsecMult, setLowsecMult] = useState('');
  const [nullsecMult, setNullsecMult] = useState('');
  const [avoidIds, setAvoidIds] = useState<number[]>([]);

  // Re-seeds route + selection state whenever the host hands us a new
  // focusRoute -- e.g. clicking a different row in an arbitrage grid --
  // without depending on object identity (a host re-creating the same
  // {sourceSystemId, targetSystemId} value every render shouldn't re-fire).
  const focusSourceId = focusRoute?.sourceSystemId;
  const focusTargetId = focusRoute?.targetSystemId;
  useEffect(() => {
    if (focusSourceId == null || focusTargetId == null) return;
    setRouteSourceId(focusSourceId);
    setRouteTargetId(focusTargetId);
    setSelectedId(focusSourceId);
  }, [focusSourceId, focusTargetId]);

  const { regions } = useRegions();
  const { systems, loading: systemsLoading } = useSystems();
  const { stargates, loading: stargatesLoading } = useStargates({});

  const kspaceSystems = useMemo(() => systems.filter((s) => !isWormholeSystem(s.name)), [systems]);

  const regionName = useMemo(() => new Map(regions.map((r): [number, string] => [r.region_id, r.name])), [regions]);
  const systemName = useMemo(() => new Map(kspaceSystems.map((s): [number, string] => [s.system_id, s.name])), [kspaceSystems]);

  const { positions, coreRadius } = useGalaxyPositions3D(kspaceSystems);

  const edges = useMemo<Edge3D[]>(() => {
    const seen = new Set<string>();
    const list: Edge3D[] = [];
    for (const gate of stargates) {
      if (!positions.has(gate.system_id) || !positions.has(gate.destination_system_id)) continue;
      const key = [gate.system_id, gate.destination_system_id].sort((a, b) => a - b).join('-');
      if (seen.has(key)) continue;
      seen.add(key);
      list.push({ key, fromId: gate.system_id, toId: gate.destination_system_id });
    }
    return list;
  }, [stargates, positions]);

  const matches = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (q.length < 2) return [];
    return kspaceSystems.filter((s) => s.name.toLowerCase().includes(q)).slice(0, 20);
  }, [search, kspaceSystems]);

  const selected: SystemSummary | undefined =
    selectedId != null ? kspaceSystems.find((s) => s.system_id === selectedId) : undefined;

  const selectedRegion = selected ? regions.find((r) => r.region_id === selected.region_id) : undefined;
  const selectedFaction = selected ? factionForRegion(regionName.get(selected.region_id) ?? '') : undefined;

  // Reused from the already-fetched full stargate list (built for `edges`
  // above) rather than firing a second request for the same data scoped
  // down to one system.
  const selectedGates = useMemo(
    () => (selectedId != null ? stargates.filter((g) => g.system_id === selectedId) : []),
    [stargates, selectedId],
  );
  const gateDestinationName = useMemo(
    () => new Map(selectedGates.map((g): [number, string] => [g.stargate_id, g.destination_system_name])),
    [selectedGates],
  );
  const { distances: selectedGateDistances } = useStargateDistances(selectedId ?? undefined);
  const { activity: selectedActivityList } = useSystemActivity({ systemId: selectedId ?? undefined });
  const selectedActivity = selectedActivityList.find((a) => a.system_id === selectedId);

  const hoveredSystem = hoveredId != null ? kspaceSystems.find((s) => s.system_id === hoveredId) : undefined;
  const hovered: Hovered3D | null =
    hoveredSystem && positions.has(hoveredSystem.system_id) ? { system: hoveredSystem, position: positions.get(hoveredSystem.system_id)! } : null;

  const routeParams =
    routeSourceId != null && routeTargetId != null
      ? {
          source_system_id: routeSourceId,
          target_system_id: routeTargetId,
          profile: routeProfile || undefined,
          warp_speed_au_s: warpSpeed ? Number(warpSpeed) : undefined,
          highsec_mult: highsecMult ? Number(highsecMult) : undefined,
          lowsec_mult: lowsecMult ? Number(lowsecMult) : undefined,
          nullsec_mult: nullsecMult ? Number(nullsecMult) : undefined,
          avoid_system_id: avoidIds.length > 0 ? avoidIds : undefined,
        }
      : null;
  const { route, loading: routeLoading, error: routeError } = useRoute(routeParams);

  // Two highlight modes, everything else fades unless neither applies:
  //  - routing (both source and target set): the computed route's systems.
  //  - general selection (source or target still unset): the selected
  //    system plus whatever it's directly connected to via a stargate --
  //    routing takes priority, so clicking around to inspect other
  //    systems while a route is active doesn't bump the route off.
  const highlightedIds = useMemo(() => {
    if (route) return new Set(route.systems.map((s) => s.system_id));
    if (selectedId == null) return null;
    const connected = new Set<number>([selectedId]);
    for (const e of edges) {
      if (e.fromId === selectedId) connected.add(e.toId);
      else if (e.toId === selectedId) connected.add(e.fromId);
    }
    return connected;
  }, [route, selectedId, edges]);

  const loading = systemsLoading || stargatesLoading;

  useEffect(() => {
    onSelectedSystemChange?.(selected ?? null);
  }, [selected, onSelectedSystemChange]);

  useEffect(() => {
    onRouteChange?.(route ?? null);
  }, [route, onRouteChange]);

  function clearRoute() {
    setRouteSourceId(null);
    setRouteTargetId(null);
  }

  return (
    <div className="map-page">
      <div className="panel panel--tight map-search-panel">
        <div className="field">
          <label htmlFor="galaxy-search">find system</label>
          <input
            id="galaxy-search"
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="type a name…"
          />
          {matches.length > 0 && (
            <div className="galaxy-search-results">
              {matches.map((s) => (
                <button
                  key={s.system_id}
                  className="galaxy-search-result"
                  onClick={() => {
                    setSelectedId(s.system_id);
                    setSearch(s.name);
                  }}
                >
                  {s.name} <span className="text-muted mono">{regionName.get(s.region_id) ?? s.region_id}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="panel map-canvas-panel">
        {loading ? (
          <p className="text-muted mono">loading the galaxy…</p>
        ) : (
          <div className="map-canvas-wrap" style={{ height: 900 }}>
            <GalaxyScene3D
              systems={kspaceSystems}
              positions={positions}
              edges={edges}
              coreRadius={coreRadius}
              selectedId={selectedId}
              highlightedIds={highlightedIds}
              hovered={hovered}
              onHover={setHoveredId}
              onSelect={setSelectedId}
              resetSignal={resetSignal}
            />
            <button className="btn map-reset-btn" onClick={() => setResetSignal((n) => n + 1)}>
              Reset view
            </button>
          </div>
        )}
      </div>

      <div className="map-layout">
        <div className="panel panel--tight map-controls">
          <SecurityLegend />
        </div>

        <div className="panel panel--tight map-detail">
          <div className="panel-header">
            <h2 className="panel-title">Selected system</h2>
          </div>
          {!selected && <p className="text-muted mono">Click a system, or search by name.</p>}
          {selected && (
            <div>
              <p className="mono" style={{ color: securityColor(selected.security_status) }}>
                {formatSecStatus(selected.security_status)} sec
              </p>
              <p>{selected.name}</p>
              <p className="text-muted mono">system_id {selected.system_id}</p>
              <p className="text-muted mono">{regionName.get(selected.region_id) ?? selected.region_id}</p>

              {selectedFaction && (
                <div className="map-faction">
                  <span className="map-faction-dot" style={{ background: selectedFaction.color }} />
                  <span>{selectedFaction.name}</span>
                </div>
              )}

              {selectedRegion?.description && (
                <>
                  <label>region lore</label>
                  <p
                    className="map-description"
                    dangerouslySetInnerHTML={{ __html: sanitizeLoreHtml(selectedRegion.description) }}
                  />
                </>
              )}

              <label>activity, last hour</label>
              <dl className="map-stat-grid">
                <dt>ship kills</dt>
                <dd>{selectedActivity?.ship_kills ?? 0}</dd>
                <dt>pod kills</dt>
                <dd>{selectedActivity?.pod_kills ?? 0}</dd>
                <dt>npc kills</dt>
                <dd>{selectedActivity?.npc_kills ?? 0}</dd>
                <dt>ship jumps</dt>
                <dd>{selectedActivity?.ship_jumps ?? 0}</dd>
              </dl>

              {selectedGateDistances.length > 0 && (
                <>
                  <label>stargate distances (in-system, between gates)</label>
                  <div className="map-gate-list">
                    {selectedGateDistances.map((d) => (
                      <div key={`${d.stargate_id_a}-${d.stargate_id_b}`} className="map-gate-row">
                        <span className="text-muted">
                          gate to {gateDestinationName.get(d.stargate_id_a) ?? d.stargate_id_a} ↔ gate to{' '}
                          {gateDestinationName.get(d.stargate_id_b) ?? d.stargate_id_b}
                        </span>
                        <span className="mono">{formatDistance(d.distance_m)}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}

              <div className="map-detail-actions">
                <button className="btn" onClick={() => setRouteSourceId(selected.system_id)}>
                  Set as route source
                </button>
                <button className="btn" onClick={() => setRouteTargetId(selected.system_id)}>
                  Set as route target
                </button>
              </div>
            </div>
          )}

          <div className="panel-header map-detail-section">
            <h2 className="panel-title">Route</h2>
          </div>
          <div className="field">
            <label htmlFor="route-profile">profile</label>
            <select
              id="route-profile"
              value={routeProfile}
              onChange={(e) => setRouteProfile(e.target.value as RouteProfile | '')}
            >
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
          <div className="route-mult-grid">
            <div className="field">
              <label htmlFor="route-mult-high">high sec</label>
              <input
                id="route-mult-high"
                type="number"
                step="any"
                value={highsecMult}
                onChange={(e) => setHighsecMult(e.target.value)}
                placeholder="1.0"
              />
            </div>
            <div className="field">
              <label htmlFor="route-mult-low">low sec</label>
              <input
                id="route-mult-low"
                type="number"
                step="any"
                value={lowsecMult}
                onChange={(e) => setLowsecMult(e.target.value)}
                placeholder="1.0"
              />
            </div>
            <div className="field">
              <label htmlFor="route-mult-null">null sec</label>
              <input
                id="route-mult-null"
                type="number"
                step="any"
                value={nullsecMult}
                onChange={(e) => setNullsecMult(e.target.value)}
                placeholder="1.0"
              />
            </div>
          </div>
          <AvoidSystemsPicker systems={kspaceSystems} systemName={systemName} avoidIds={avoidIds} onChange={setAvoidIds} />
          {!routeParams && (
            <p className="text-muted mono">Pick a source and target to highlight the path between them.</p>
          )}
          {routeParams && routeLoading && <p className="text-muted mono">computing route…</p>}
          {routeParams && routeError && <p className="error-text">{routeError}</p>}
          {route && (
            <div>
              <p className="mono">
                {route.total_jumps} jumps · {formatDuration(route.total_time_s)}
              </p>
              <div className="route-stops">
                {route.systems.map((s) => (
                  <button
                    key={s.system_id}
                    className={`route-stop route-stop--clickable${s.system_id === selectedId ? ' route-stop--selected' : ''}`}
                    onClick={() => setSelectedId(s.system_id)}
                  >
                    <span className="mono" style={{ color: securityColor(s.security_status) }}>
                      {formatSecStatus(s.security_status)}
                    </span>
                    <span>{s.name}</span>
                  </button>
                ))}
              </div>
              <div className="map-detail-actions">
                <button className="btn" onClick={clearRoute}>
                  Clear route
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
