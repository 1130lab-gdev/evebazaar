import { memo } from 'react';
import { securityColor } from '../../lib/securityColor';
import type { SystemActivity, SystemSummary } from '../../api/map/types';
import type { Point } from './useGalaxyLayout';

interface Props {
  system: SystemSummary;
  point: Point;
  activity?: SystemActivity;
  selected?: boolean;
  /** Whether to render the inline name label. Selected always shows regardless. */
  showLabel?: boolean;
  /** Fixed radius override -- skips the activity-scaled default. Used at whole-galaxy scale, where thousands of dots need to stay small and uniform (and match the radius collision-avoidance was computed against). */
  radius?: number;
  /** Kill-activity halo. Off by default at whole-galaxy scale: its radius (node radius + 8) is much bigger than the collision-avoidance spacing, so it reads as visual overlap even when the nodes themselves aren't colliding. */
  showGlow?: boolean;
  onClick?: (systemId: number) => void;
  /** Fires on hover enter with the pointer's client coords (for tooltip placement), and on leave with (null). */
  onHover?: (systemId: number | null, clientPos?: { x: number; y: number }) => void;
}

function SystemNodeImpl({
  system,
  point,
  activity,
  selected,
  showLabel = true,
  radius: radiusOverride,
  showGlow = true,
  onClick,
  onHover,
}: Props) {
  const color = securityColor(system.security_status);
  const jumps = activity?.ship_jumps ?? 0;
  const kills = (activity?.ship_kills ?? 0) + (activity?.npc_kills ?? 0) + (activity?.pod_kills ?? 0);
  const radius = radiusOverride ?? 4 + Math.min(6, Math.sqrt(jumps) * 0.5);
  const glowOpacity = showGlow ? Math.min(0.6, kills / 20) : 0;

  return (
    <g
      transform={`translate(${point.x}, ${point.y})`}
      onClick={() => onClick?.(system.system_id)}
      onMouseEnter={(e) => onHover?.(system.system_id, { x: e.clientX, y: e.clientY })}
      onMouseLeave={() => onHover?.(null)}
      className={onClick ? 'map-node map-node--clickable' : 'map-node'}
    >
      {glowOpacity > 0 && <circle r={radius + 8} fill="var(--accent-red)" opacity={glowOpacity} />}
      {/* Fixed-size, independent of node radius, so a selection is spottable
          even when zoomed out over thousands of systems (galaxy view). */}
      {selected && <circle r={18} className="map-node-selected-ring" />}
      <circle r={radius} fill={color} stroke={selected ? 'var(--accent-cyan)' : 'var(--bg-void)'} strokeWidth={selected ? 2 : 1} />
      {(showLabel || selected) && (
        <text x={radius + 4} y={3} className="map-label">
          {system.name}
        </text>
      )}
    </g>
  );
}

// Galaxy view renders ~8.5k of these; memoizing means an unrelated state
// change elsewhere in MapCanvas (e.g. hovering a different system) skips
// reconciling every node whose props didn't actually change.
export const SystemNode = memo(SystemNodeImpl);
