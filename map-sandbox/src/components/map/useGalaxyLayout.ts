import { useMemo } from 'react';
import type { SystemSummary } from '../../api/map/types';
import { deconflictPositions } from './deconflict';

export interface Point {
  x: number;
  y: number;
}

export const VIEW_SIZE = 1000;
const PADDING = 60;

// New Eden's real position data isn't evenly spread -- most systems sit in
// a tight core, with a smaller set of genuinely remote ones (Pochven,
// Thera, and a handful of other frontier systems) sitting far enough out
// that a literal min/max fit lets them alone dictate the scale, crushing
// the other ~90% of systems into a sliver of the canvas. Verified against
// live data: an unclipped fit put 54% of all k-space systems into 10 grid
// cells out of 10,000; clipping the fit to the 8th-92nd percentile per
// axis spreads that same data across ~2,700 cells instead. The systems
// that fall outside the clipped range are still rendered -- see
// radialClamp -- just pinned toward the edge in their true direction from
// center rather than either dominating the scale or being cut off.
export const CLIP_GALAXY_VIEW = 0.08;

function percentile(sorted: number[], p: number): number {
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
}

function radialClamp(x: number, y: number): Point {
  const center = VIEW_SIZE / 2;
  const maxRadius = VIEW_SIZE / 2 - 8;
  const dx = x - center;
  const dy = y - center;
  const r = Math.hypot(dx, dy);
  if (r <= maxRadius) return { x, y };
  const scale = maxRadius / r;
  return { x: center + dx * scale, y: center + dy * scale };
}

/**
 * True galactic positions, fit to the viewBox. EVE's own starmap treats
 * X/Z as the horizontal plane and Y as vertical depth, so we project X/Z
 * -- plotting X/Y directly would flatten a dimension that actually varies.
 *
 * `clipPercentile` (0 by default) trims that many extreme systems off each
 * end per axis before fitting the scale -- pass CLIP_GALAXY_VIEW (see
 * above) for the whole-galaxy view. Leave it at 0 for anything where
 * every system matters and the set is already small/curated (a route, a
 * single region) -- clipping there risks pinning something that actually
 * matters, like a route's own source/target, to the edge.
 *
 * `collideRadius` (0 = off) runs the result through deconflictPositions so
 * no two systems ever render on top of each other -- pass whatever radius
 * the caller is actually rendering nodes at, since that's what "no
 * collisions" needs to be measured against.
 */
export function useGalaxyLayout(systems: SystemSummary[], clipPercentile = 0, collideRadius = 0): Map<number, Point> {
  return useMemo(() => {
    const positions = new Map<number, Point>();
    if (systems.length === 0) return positions;

    const xsSorted = systems.map((s) => s.position_x).sort((a, b) => a - b);
    const zsSorted = systems.map((s) => s.position_z).sort((a, b) => a - b);
    const minX = percentile(xsSorted, clipPercentile);
    const maxX = percentile(xsSorted, 1 - clipPercentile);
    const minZ = percentile(zsSorted, clipPercentile);
    const maxZ = percentile(zsSorted, 1 - clipPercentile);

    const spanX = maxX - minX || 1;
    const spanZ = maxZ - minZ || 1;
    const span = Math.max(spanX, spanZ);
    const scale = (VIEW_SIZE - PADDING * 2) / span;
    const offsetX = (VIEW_SIZE - spanX * scale) / 2;
    const offsetZ = (VIEW_SIZE - spanZ * scale) / 2;

    for (const s of systems) {
      const rawX = (s.position_x - minX) * scale + offsetX;
      // Flip: screen Y grows downward, galactic Z does not.
      const rawY = VIEW_SIZE - ((s.position_z - minZ) * scale + offsetZ);
      positions.set(s.system_id, radialClamp(rawX, rawY));
    }
    return collideRadius > 0 ? deconflictPositions(positions, collideRadius * 2, VIEW_SIZE) : positions;
  }, [systems, clipPercentile, collideRadius]);
}
