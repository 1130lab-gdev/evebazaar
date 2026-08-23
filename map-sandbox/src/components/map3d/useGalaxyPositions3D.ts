import { useMemo } from 'react';
import * as THREE from 'three';
import type { SystemSummary } from '../../api/map/types';

// Arbitrary but reasonable Three.js scene-unit span for the whole galaxy
// to occupy -- chosen so default camera near/far planes and OrbitControls
// zoom limits behave sanely, not tied to any real-world unit.
const TARGET_SCENE_SPAN = 2000;

// Real EVE position data clumps heavily (dense core, sparse frontier --
// same root cause as the 2D views' CLIP_GALAXY_VIEW). A uniform scale
// can't fix that: scaling everything by the same factor leaves relative
// crowding exactly as it was, it just zooms. To actually spread dense
// clusters apart, each point's distance from the galaxy centroid is
// raised to this power (direction preserved, only radial magnitude
// changes) before the final scale -- points close to the center get
// pushed disproportionately farther out than points already far away.
//
// Verified against live k-space data: at power=1, the busiest 20-unit
// grid cell held 36% of all systems in the top 10 cells combined; at
// power=1.3 that drops to 2%, and median nearest-neighbor distance goes
// up ~7x. Normalizing against the single farthest point (rather than a
// percentile) was tried first and rejected -- a handful of genuine
// outliers (Pochven, Thera) blew up disproportionately under the power
// transform and, once used as the normalization reference, crushed
// everything else down to a sliver of the target span. Percentile-based
// normalization (matching the 2D views' CLIP_GALAXY_VIEW lesson) avoids
// that; those same outliers still end up far out in scene space (~29x
// the target span at this power), which is fine for a free 3D camera --
// they're reachable by zooming out, not clipped or distorted.
const EXPANSION_POWER = 1.3;
const EXPANSION_NORM_PERCENTILE = 0.9;

export interface GalaxyPositions3D {
  /** system_id -> scene-space position, direction from galaxy center preserved exactly; only radial distance is nonlinearly re-scaled (see EXPANSION_POWER). */
  positions: Map<number, THREE.Vector3>;
  /**
   * Radius of the sphere (centered on the data's own centroid, which
   * maps to the scene origin) containing 80% of systems by distance,
   * post-expansion. Used only as an initial-camera-framing hint --
   * "intelligent" here means starting the view on the dense, interesting
   * core rather than zoomed out far enough to fit remote outliers, which
   * are still present and reachable by flying the camera out.
   */
  coreRadius: number;
}

function percentile(sorted: number[], p: number): number {
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
}

export function useGalaxyPositions3D(systems: SystemSummary[]): GalaxyPositions3D {
  return useMemo(() => {
    const positions = new Map<number, THREE.Vector3>();
    if (systems.length === 0) return { positions, coreRadius: TARGET_SCENE_SPAN / 4 };

    let sumX = 0;
    let sumY = 0;
    let sumZ = 0;
    for (const s of systems) {
      sumX += s.position_x;
      sumY += s.position_y;
      sumZ += s.position_z;
    }
    const centroidX = sumX / systems.length;
    const centroidY = sumY / systems.length;
    const centroidZ = sumZ / systems.length;

    // Centered, unscaled offsets and their lengths first, so the
    // normalization reference (a percentile of these lengths) is
    // computed before any expansion is applied.
    const offsets = systems.map((s) => ({
      id: s.system_id,
      x: s.position_x - centroidX,
      y: s.position_y - centroidY,
      z: s.position_z - centroidZ,
    }));
    const lengths = offsets.map((o) => Math.hypot(o.x, o.y, o.z));
    const sortedLengths = [...lengths].sort((a, b) => a - b);
    const refLength = percentile(sortedLengths, EXPANSION_NORM_PERCENTILE) || 1;
    // A point at exactly refLength (pre-expansion) should land at
    // TARGET_SCENE_SPAN/2 (post-expansion) -- solve for the constant
    // that makes that true given EXPANSION_POWER.
    const norm = TARGET_SCENE_SPAN / 2 / Math.pow(refLength, EXPANSION_POWER);

    const expandedLengths: number[] = [];
    offsets.forEach((o, i) => {
      const len = lengths[i];
      if (len === 0) {
        positions.set(o.id, new THREE.Vector3(0, 0, 0));
        expandedLengths.push(0);
        return;
      }
      const newLen = Math.pow(len, EXPANSION_POWER) * norm;
      const s = newLen / len;
      positions.set(o.id, new THREE.Vector3(o.x * s, o.y * s, o.z * s));
      expandedLengths.push(newLen);
    });

    expandedLengths.sort((a, b) => a - b);
    const coreRadius = percentile(expandedLengths, 0.8) || TARGET_SCENE_SPAN / 4;

    return { positions, coreRadius };
  }, [systems]);
}
