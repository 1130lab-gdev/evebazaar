import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { ThreeEvent } from '@react-three/fiber';
import { securityColor } from '../../lib/securityColor';
import type { SystemSummary } from '../../api/map/types';

// Sized against the expanded layout's real spacing (median nearest-
// neighbor ~7.5 world units, see useGalaxyPositions3D) -- small enough
// that neighboring spheres read as distinct, not touching, in typical
// local density.
const SPHERE_RADIUS = 1.0;
const SPHERE_SEGMENTS = 10;
// How dim a non-highlighted system gets while a route is active.
const FADE_FACTOR = 0.12;

interface Props {
  systems: SystemSummary[];
  positions: Map<number, THREE.Vector3>;
  /** When set, only these systems render at full brightness -- everything else fades. Route mode. */
  highlightedIds?: Set<number> | null;
  onHover?: (systemId: number | null) => void;
  onClick?: (systemId: number) => void;
}

const tmpColor = new THREE.Color();
const tmpMatrix = new THREE.Matrix4();

/**
 * Real 3D sphere geometry per system via InstancedMesh (one draw call
 * regardless of count, same GPU-instancing principle the earlier Points
 * approach used) instead of camera-facing point sprites -- sprites always
 * face the camera flat-on, which reads as a 2D texture pasted into the
 * scene rather than an object actually occupying 3D space; a lit sphere
 * has real depth (a visible highlight/shadow gradient) that sells the "3D"
 * illusion sprites can't.
 */
export function StarSpheres({ systems, positions, highlightedIds, onHover, onClick }: Props) {
  const meshRef = useRef<THREE.InstancedMesh>(null);

  const { idByInstance, baseColors, count } = useMemo(() => {
    const ids: number[] = [];
    const colors: THREE.Color[] = [];
    for (const s of systems) {
      if (!positions.get(s.system_id)) continue;
      ids.push(s.system_id);
      colors.push(new THREE.Color(securityColor(s.security_status)));
    }
    return { idByInstance: ids, baseColors: colors, count: ids.length };
  }, [systems, positions]);

  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    for (let i = 0; i < idByInstance.length; i++) {
      const p = positions.get(idByInstance[i]);
      if (!p) continue;
      tmpMatrix.makeTranslation(p.x, p.y, p.z);
      mesh.setMatrixAt(i, tmpMatrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [idByInstance, positions]);

  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    for (let i = 0; i < idByInstance.length; i++) {
      const fade = !highlightedIds || highlightedIds.has(idByInstance[i]) ? 1 : FADE_FACTOR;
      const base = baseColors[i];
      mesh.setColorAt(i, tmpColor.setRGB(base.r * fade, base.g * fade, base.b * fade));
    }
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [idByInstance, baseColors, highlightedIds]);

  // Gate on actual changes, not every pointermove tick while hovering the
  // same instance.
  const lastHoveredId = useRef<number | null>(null);

  function handlePointerMove(e: ThreeEvent<PointerEvent>) {
    e.stopPropagation();
    const id = e.instanceId != null ? (idByInstance[e.instanceId] ?? null) : null;
    if (id !== lastHoveredId.current) {
      lastHoveredId.current = id;
      onHover?.(id);
    }
  }

  function handlePointerOut() {
    if (lastHoveredId.current !== null) {
      lastHoveredId.current = null;
      onHover?.(null);
    }
  }

  function handleClick(e: ThreeEvent<MouseEvent>) {
    e.stopPropagation();
    if (e.instanceId != null && idByInstance[e.instanceId] != null) onClick?.(idByInstance[e.instanceId]);
  }

  if (count === 0) return null;

  return (
    <instancedMesh
      key={count}
      ref={meshRef}
      args={[undefined, undefined, count]}
      onPointerMove={handlePointerMove}
      onPointerOut={handlePointerOut}
      onClick={handleClick}
    >
      <sphereGeometry args={[SPHERE_RADIUS, SPHERE_SEGMENTS, SPHERE_SEGMENTS]} />
      <meshStandardMaterial roughness={0.55} metalness={0.15} />
    </instancedMesh>
  );
}
