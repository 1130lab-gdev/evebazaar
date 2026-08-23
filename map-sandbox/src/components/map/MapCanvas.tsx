import { useCallback, useRef, useState } from 'react';
import { usePanZoom } from './usePanZoom';
import { SystemNode } from './SystemNode';
import { RouteOverlay } from './RouteOverlay';
import { securityColor } from '../../lib/securityColor';
import { formatSecStatus } from '../../lib/format';
import type { RouteLeg, SystemActivity, SystemSummary } from '../../api/map/types';
import { VIEW_SIZE, type Point } from './useGalaxyLayout';

export interface MapEdge {
  key: string;
  from: Point;
  to: Point;
}

interface Props {
  systems: SystemSummary[];
  positions: Map<number, Point>;
  edges: MapEdge[];
  activityBySystem?: Map<number, SystemActivity>;
  selectedSystemId?: number | null;
  onSystemClick?: (systemId: number) => void;
  routeLegs?: RouteLeg[];
  height?: number;
  /** Fixed radius override for every node, e.g. whole-galaxy scale. See SystemNode. */
  nodeRadius?: number;
  /** Kill-activity halo, on by default. See SystemNode. */
  showGlow?: boolean;
}

interface Hover {
  systemId: number;
  clientX: number;
  clientY: number;
}

export function MapCanvas({
  systems,
  positions,
  edges,
  activityBySystem,
  selectedSystemId,
  onSystemClick,
  routeLegs,
  height = 720,
  nodeRadius,
  showGlow = true,
}: Props) {
  const { svgRef, groupRef, reset, handlers } = usePanZoom(VIEW_SIZE);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [hovered, setHovered] = useState<Hover | null>(null);

  // Stable identity so SystemNode's memo isn't defeated by a fresh closure
  // on every render -- hover only updates on discrete enter/leave events
  // (not on every mousemove), so this only fires when it actually matters.
  const handleHover = useCallback((systemId: number | null, clientPos?: { x: number; y: number }) => {
    if (systemId == null || !clientPos) {
      setHovered(null);
      return;
    }
    setHovered({ systemId, clientX: clientPos.x, clientY: clientPos.y });
  }, []);

  const hoveredSystem = hovered ? systems.find((s) => s.system_id === hovered.systemId) : undefined;
  const hoveredActivity = hovered ? activityBySystem?.get(hovered.systemId) : undefined;
  // Above this, inline labels for every system are DOM/legibility noise
  // (whole-galaxy view is ~8.5k systems) -- the selected node still forces
  // its own label on regardless (see SystemNode).
  const showAllLabels = systems.length <= 200;

  let tooltipPos: { left: number; top: number } | null = null;
  if (hovered) {
    const rect = wrapRef.current?.getBoundingClientRect();
    tooltipPos = rect
      ? { left: hovered.clientX - rect.left + 14, top: hovered.clientY - rect.top + 14 }
      : { left: hovered.clientX + 14, top: hovered.clientY + 14 };
  }

  return (
    <div className="map-canvas-wrap" style={{ height }} ref={wrapRef}>
      <svg ref={svgRef} viewBox={`0 0 ${VIEW_SIZE} ${VIEW_SIZE}`} className="map-surface" {...handlers}>
        <g ref={groupRef} transform="translate(0, 0) scale(1)">
          {edges.map((e) => (
            <line key={e.key} x1={e.from.x} y1={e.from.y} x2={e.to.x} y2={e.to.y} className="map-edge" />
          ))}
          {routeLegs && <RouteOverlay legs={routeLegs} positions={positions} />}
          {systems.map((s) => {
            const p = positions.get(s.system_id);
            if (!p) return null;
            return (
              <SystemNode
                key={s.system_id}
                system={s}
                point={p}
                activity={activityBySystem?.get(s.system_id)}
                selected={s.system_id === selectedSystemId}
                showLabel={showAllLabels}
                radius={nodeRadius}
                showGlow={showGlow}
                onClick={onSystemClick}
                onHover={handleHover}
              />
            );
          })}
        </g>
      </svg>

      <button className="btn map-reset-btn" onClick={reset}>
        Reset view
      </button>

      {hoveredSystem && tooltipPos && (
        <div className="map-tooltip" style={{ left: tooltipPos.left, top: tooltipPos.top }}>
          <div className="mono" style={{ color: securityColor(hoveredSystem.security_status) }}>
            {formatSecStatus(hoveredSystem.security_status)} sec
          </div>
          <div>{hoveredSystem.name}</div>
          {hoveredActivity && (
            <div className="text-muted mono map-tooltip-activity">
              {hoveredActivity.ship_jumps} jumps · {hoveredActivity.ship_kills + hoveredActivity.npc_kills + hoveredActivity.pod_kills}{' '}
              kills/hr
            </div>
          )}
        </div>
      )}
    </div>
  );
}
