import { useEffect, useState } from 'react';
import { forceSimulation, forceLink, forceManyBody, forceCollide, type SimulationNodeDatum } from 'd3-force';
import type { SystemSummary, Stargate } from '../../api/map/types';
import { useGalaxyLayout, VIEW_SIZE, type Point } from './useGalaxyLayout';

const PADDING = 40;

interface SimNode extends SimulationNodeDatum {
  id: number;
}

interface SimLink {
  source: number;
  target: number;
}

const TICKS = 300;

/**
 * A relaxed layout for the "working" region/constellation view: real EVE
 * regions bunch tightly with occasional far outliers, which makes a
 * true-position projection unreadable at this zoom level (see useGalaxyLayout).
 * Seeded from real positions so the result stays roughly true-to-shape, then
 * relaxed with spring edges (stargates) + repulsion + collision avoidance so
 * nodes are actually clickable. Ticked synchronously rather than animated --
 * this is a one-shot layout pass per filter change, not a live simulation.
 */
export function useSchematicLayout(systems: SystemSummary[], stargates: Stargate[]): Map<number, Point> {
  const seed = useGalaxyLayout(systems);
  const [positions, setPositions] = useState<Map<number, Point>>(new Map());

  useEffect(() => {
    if (systems.length === 0) {
      setPositions(new Map());
      return;
    }

    const systemIds = new Set(systems.map((s) => s.system_id));
    const seenLinks = new Set<string>();
    const links: SimLink[] = [];
    for (const gate of stargates) {
      if (!systemIds.has(gate.system_id) || !systemIds.has(gate.destination_system_id)) continue;
      const key = [gate.system_id, gate.destination_system_id].sort((a, b) => a - b).join('-');
      if (seenLinks.has(key)) continue;
      seenLinks.add(key);
      links.push({ source: gate.system_id, target: gate.destination_system_id });
    }

    const nodes: SimNode[] = systems.map((s) => {
      const p = seed.get(s.system_id) ?? { x: 500, y: 500 };
      return { id: s.system_id, x: p.x, y: p.y };
    });

    const linkForce = forceLink<SimNode, SimLink>(links)
      .id((d) => d.id)
      .distance(50)
      .strength(0.4);

    const sim = forceSimulation<SimNode>(nodes)
      .force('link', linkForce)
      .force('charge', forceManyBody().strength(-140))
      .force('collide', forceCollide(22))
      .stop();

    for (let i = 0; i < TICKS; i++) sim.tick();

    // The repulsion/link forces routinely spread the simulation's output
    // well outside the seed positions' original bounds -- re-fit to the
    // viewBox here rather than relying on the caller to pan/zoom to find it.
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const n of nodes) {
      const x = n.x ?? 0;
      const y = n.y ?? 0;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    const spanX = maxX - minX || 1;
    const spanY = maxY - minY || 1;
    const span = Math.max(spanX, spanY);
    const scale = (VIEW_SIZE - PADDING * 2) / span;
    const offsetX = (VIEW_SIZE - spanX * scale) / 2;
    const offsetY = (VIEW_SIZE - spanY * scale) / 2;

    const result = new Map<number, Point>();
    for (const n of nodes) {
      const x = ((n.x ?? 0) - minX) * scale + offsetX;
      const y = ((n.y ?? 0) - minY) * scale + offsetY;
      result.set(n.id, { x, y });
    }
    setPositions(result);
  }, [systems, stargates, seed]);

  return positions;
}
