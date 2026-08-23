import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';

interface Props {
  controlsRef: React.RefObject<OrbitControlsImpl | null>;
  /** Scene-space point to fly the camera toward, or null to leave the camera alone. */
  focusPoint: THREE.Vector3 | null;
  focusDistance?: number;
  /** Bump to re-trigger the same focusPoint (e.g. clicking an already-selected system again). */
  focusSignal?: number;
}

const LERP_SPEED = 0.07;
const ARRIVE_EPSILON = 0.5;

/**
 * Smoothly flies the camera and orbit target toward `focusPoint`,
 * preserving the current viewing direction rather than snapping to a
 * fixed angle -- reads as "the camera glides in," not a jump cut.
 */
export function CameraRig({ controlsRef, focusPoint, focusDistance = 220, focusSignal = 0 }: Props) {
  const { camera } = useThree();
  const desiredTarget = useRef(new THREE.Vector3());
  const desiredCamPos = useRef(new THREE.Vector3());
  const active = useRef(false);

  useEffect(() => {
    const controls = controlsRef.current;
    if (!focusPoint || !controls) return;
    desiredTarget.current.copy(focusPoint);
    const dir = camera.position.clone().sub(controls.target);
    if (dir.lengthSq() < 1e-6) dir.set(0, 0.3, 1);
    dir.normalize();
    desiredCamPos.current.copy(focusPoint).addScaledVector(dir, focusDistance);
    active.current = true;
  }, [focusPoint, focusDistance, focusSignal]);

  useFrame(() => {
    if (!active.current) return;
    const controls = controlsRef.current;
    if (!controls) return;
    controls.target.lerp(desiredTarget.current, LERP_SPEED);
    camera.position.lerp(desiredCamPos.current, LERP_SPEED);
    controls.update();
    if (controls.target.distanceTo(desiredTarget.current) < ARRIVE_EPSILON && camera.position.distanceTo(desiredCamPos.current) < ARRIVE_EPSILON) {
      active.current = false;
    }
  });

  return null;
}
