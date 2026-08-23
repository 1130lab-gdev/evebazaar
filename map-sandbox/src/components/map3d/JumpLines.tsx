import { useMemo } from 'react';
import * as THREE from 'three';

export interface Edge3D {
  key: string;
  fromId: number;
  toId: number;
}

interface Props {
  edges: Edge3D[];
  positions: Map<number, THREE.Vector3>;
  /** When set, only edges with both endpoints in this set render bright. Route mode. */
  highlightedIds?: Set<number> | null;
}

/** Per-vertex color carries the route fade (dim navy vs. bright blue) -- LineBasicMaterial has no per-vertex opacity without a custom shader, same limitation StarSpheres works around the same way. */
export function JumpLines({ edges, positions, highlightedIds }: Props) {
  const geometry = useMemo(() => {
    const posArray: number[] = [];
    const colorArray: number[] = [];
    const dim = new THREE.Color('#2c4964');
    const bright = new THREE.Color('#3d7fbf');
    for (const e of edges) {
      const a = positions.get(e.fromId);
      const b = positions.get(e.toId);
      if (!a || !b) continue;
      posArray.push(a.x, a.y, a.z, b.x, b.y, b.z);
      const c = highlightedIds && highlightedIds.has(e.fromId) && highlightedIds.has(e.toId) ? bright : dim;
      colorArray.push(c.r, c.g, c.b, c.r, c.g, c.b);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(posArray, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colorArray, 3));
    return geo;
  }, [edges, positions, highlightedIds]);

  return (
    <lineSegments geometry={geometry}>
      <lineBasicMaterial vertexColors transparent opacity={0.5} />
    </lineSegments>
  );
}
