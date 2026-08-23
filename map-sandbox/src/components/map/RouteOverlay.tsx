import type { RouteLeg } from '../../api/map/types';
import type { Point } from './useGalaxyLayout';

interface Props {
  legs: RouteLeg[];
  positions: Map<number, Point>;
}

export function RouteOverlay({ legs, positions }: Props) {
  return (
    <>
      {legs.map((leg, i) => {
        const from = positions.get(leg.from_system_id);
        const to = positions.get(leg.to_system_id);
        if (!from || !to) return null;
        return (
          <line
            key={i}
            x1={from.x}
            y1={from.y}
            x2={to.x}
            y2={to.y}
            className={leg.kind === 'jump' ? 'map-route-jump' : 'map-route-warp'}
          />
        );
      })}
    </>
  );
}
