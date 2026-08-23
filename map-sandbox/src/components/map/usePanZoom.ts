import { useRef } from 'react';

interface PanZoomState {
  scale: number;
  tx: number;
  ty: number;
}

/**
 * Drag-to-pan, wheel-to-zoom for an SVG with a fixed square viewBox.
 *
 * Deliberately NOT React state: at galaxy scale (~8.5k systems, ~7k edges)
 * a useState-driven transform re-renders and reconciles the entire node
 * tree on every single pointermove/wheel event during a drag, which is
 * what made panning/zooming feel broken there. Instead this mutates the
 * `<g>` element's `transform` attribute directly via `groupRef`, so
 * interaction cost is independent of how many systems are on screen.
 */
export function usePanZoom(viewBoxSize: number) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const groupRef = useRef<SVGGElement | null>(null);
  const dragRef = useRef<{ x: number; y: number } | null>(null);
  const stateRef = useRef<PanZoomState>({ scale: 1, tx: 0, ty: 0 });

  function applyTransform() {
    const { scale, tx, ty } = stateRef.current;
    groupRef.current?.setAttribute('transform', `translate(${tx}, ${ty}) scale(${scale})`);
  }

  function pxToViewBox(px: number): number {
    const width = svgRef.current?.getBoundingClientRect().width;
    return width ? px * (viewBoxSize / width) : px;
  }

  function onWheel(e: React.WheelEvent<SVGSVGElement>) {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
    stateRef.current.scale = Math.min(8, Math.max(0.2, stateRef.current.scale * factor));
    applyTransform();
  }

  function onPointerDown(e: React.PointerEvent<SVGSVGElement>) {
    dragRef.current = { x: e.clientX, y: e.clientY };
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: React.PointerEvent<SVGSVGElement>) {
    if (!dragRef.current) return;
    const dxPx = e.clientX - dragRef.current.x;
    const dyPx = e.clientY - dragRef.current.y;
    dragRef.current = { x: e.clientX, y: e.clientY };
    stateRef.current.tx += pxToViewBox(dxPx);
    stateRef.current.ty += pxToViewBox(dyPx);
    applyTransform();
  }

  function endDrag() {
    dragRef.current = null;
  }

  function reset() {
    stateRef.current = { scale: 1, tx: 0, ty: 0 };
    applyTransform();
  }

  return {
    svgRef,
    groupRef,
    reset,
    handlers: {
      onWheel,
      onPointerDown,
      onPointerMove,
      onPointerUp: endDrag,
      onPointerLeave: endDrag,
    },
  };
}
