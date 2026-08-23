import { useEffect, useRef } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls, Html, Stars } from '@react-three/drei';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { StarSpheres } from './StarSpheres';
import { JumpLines, type Edge3D } from './JumpLines';
import { CameraRig } from './CameraRig';
import { securityColor } from '../../lib/securityColor';
import { formatSecStatus } from '../../lib/format';
import type { SystemSummary } from '../../api/map/types';

export interface Hovered3D {
  system: SystemSummary;
  position: THREE.Vector3;
}

interface Props {
  systems: SystemSummary[];
  positions: Map<number, THREE.Vector3>;
  edges: Edge3D[];
  coreRadius: number;
  selectedId: number | null;
  highlightedIds?: Set<number> | null;
  hovered: Hovered3D | null;
  onHover: (systemId: number | null) => void;
  onSelect: (systemId: number) => void;
  /** Bump to reset the camera to its initial framing. */
  resetSignal: number;
}

function ResetHandler({
  controlsRef,
  initialCamPos,
  resetSignal,
}: {
  controlsRef: React.RefObject<OrbitControlsImpl | null>;
  initialCamPos: THREE.Vector3;
  resetSignal: number;
}) {
  const { camera } = useThree();
  useEffect(() => {
    camera.position.copy(initialCamPos);
    controlsRef.current?.target.set(0, 0, 0);
    controlsRef.current?.update();
    // resetSignal is the trigger; initialCamPos/camera are stable per
    // mount and deliberately not deps.
  }, [resetSignal]);
  return null;
}

export function GalaxyScene3D({ systems, positions, edges, coreRadius, selectedId, highlightedIds, hovered, onHover, onSelect, resetSignal }: Props) {
  const controlsRef = useRef<OrbitControlsImpl>(null);
  const initialDistanceRef = useRef(Math.max(coreRadius * 2.2, 60));
  const initialCamPosRef = useRef(
    new THREE.Vector3(initialDistanceRef.current * 0.5, initialDistanceRef.current * 0.35, initialDistanceRef.current),
  );
  // A handful of real outliers (Pochven, Thera) can land ~30x the core
  // radius out under the radial expansion (see useGalaxyPositions3D) --
  // generous enough that they're still reachable by zooming out, not a
  // hidden dead zone past the control limit.
  const maxOrbitDistanceRef = useRef(Math.max(initialDistanceRef.current * 8, 40000));

  const focusPoint = selectedId != null ? (positions.get(selectedId) ?? null) : null;
  const selectedPosition = selectedId != null ? (positions.get(selectedId) ?? null) : null;

  return (
    <Canvas camera={{ position: initialCamPosRef.current.toArray(), fov: 55, near: 1, far: 100000 }}>
      <color attach="background" args={['#04060c']} />
      <Stars radius={initialDistanceRef.current * 8} depth={initialDistanceRef.current * 4} count={2000} factor={2} fade speed={0.2} />
      <ambientLight intensity={0.5} />
      <directionalLight position={[1, 1.2, 0.8]} intensity={1.6} />
      <directionalLight position={[-1, -0.6, -1]} intensity={0.5} color="#3d7fbf" />
      <ResetHandler controlsRef={controlsRef} initialCamPos={initialCamPosRef.current} resetSignal={resetSignal} />
      <StarSpheres systems={systems} positions={positions} highlightedIds={highlightedIds} onHover={onHover} onClick={onSelect} />
      <JumpLines edges={edges} positions={positions} highlightedIds={highlightedIds} />
      <CameraRig controlsRef={controlsRef} focusPoint={focusPoint} focusSignal={selectedId ?? 0} />
      <OrbitControls
        ref={controlsRef}
        makeDefault
        enableDamping
        dampingFactor={0.08}
        minDistance={20}
        maxDistance={maxOrbitDistanceRef.current}
      />
      {selectedPosition && (
        // Wireframe sphere rather than a flat ring -- a ring only reads
        // correctly face-on to the camera; a sphere looks right from any
        // angle, which matters here since the camera orbits freely.
        <mesh position={selectedPosition}>
          <sphereGeometry args={[6, 16, 16]} />
          <meshBasicMaterial color="#00e5ff" wireframe transparent opacity={0.9} />
        </mesh>
      )}
      {hovered && (
        <Html position={hovered.position} style={{ pointerEvents: 'none' }} zIndexRange={[10, 0]}>
          <div className="map-tooltip-3d">
            <div className="mono" style={{ color: securityColor(hovered.system.security_status) }}>
              {formatSecStatus(hovered.system.security_status)} sec
            </div>
            <div>{hovered.system.name}</div>
          </div>
        </Html>
      )}
    </Canvas>
  );
}
