import { useState } from 'react';
import { AnimatedText } from '@eve-anim/text-animations';
import { useHaulers } from '../../api/catalog/useHaulers';
import { useRuns } from '../../api/catalog/useRuns';
import { useSystems } from '../../api/map/useSystems';
import { GalaxyMap } from '../map/GalaxyMap';
import { HaulerForm } from './HaulerForm';
import { RunCard } from './RunCard';
import { formatIsk, formatVolume } from '../../lib/format';
import type { Hauler } from '../../api/catalog/types';

type MapFocus = { sourceSystemId: number; targetSystemId: number };

/**
 * Hauler CRUD + their saved runs. A run's legs are built either via the
 * Route Planner (which sizes quantities against a depleting budget across
 * the whole itinerary) or one at a time from the Arbitrage scanner --
 * either way they land here, pinned to whichever hauler they were saved
 * against.
 */
export function HaulersPage() {
  const { haulers, loading, error, createHauler, updateHauler, deleteHauler } = useHaulers();
  const { systems } = useSystems();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [editing, setEditing] = useState<Hauler | null>(null);
  const { runs, loading: runsLoading, updateRunStatus, deleteRun, setLegCompleted } = useRuns(selectedId);
  const [mapFocus, setMapFocus] = useState<MapFocus | null>(null);

  function homeSystemName(hauler: Hauler): string | null {
    if (hauler.home_system_id === null) return null;
    return systems.find((s) => s.system_id === hauler.home_system_id)?.name ?? `system #${hauler.home_system_id}`;
  }

  const selected = haulers.find((h) => h.hauler_id === selectedId) ?? null;

  async function handleDeleteHauler(hauler: Hauler) {
    if (!window.confirm(`Delete hauler "${hauler.name}"? This also deletes all of its saved runs.`)) return;
    await deleteHauler(hauler.hauler_id);
    if (selectedId === hauler.hauler_id) setSelectedId(null);
  }

  return (
    <section className="section" style={{ paddingTop: 140 }}>
      <div className="section-inner">
        <p className="eyebrow">New Eden // Hauler Profiles</p>
        <AnimatedText
          as="h2"
          className="section-heading"
          preset="fade-up-words"
          settingsOverrides={{ text: "Your fleet, and where it's been." }}
          styleOverrides={{ fontSize: 34, textAlign: 'left', color: '#eef4fa' }}
        />

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 0.85fr) minmax(0, 2.15fr)', gap: 20, marginTop: 24, alignItems: 'start' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="panel panel--tight">
              <div className="panel-header">
                <h3 className="panel-title">{editing ? 'Edit hauler' : 'New hauler'}</h3>
              </div>
              <HaulerForm
                editing={editing}
                onCancel={() => setEditing(null)}
                onSubmit={async (req) => {
                  if (editing) {
                    await updateHauler(editing.hauler_id, req);
                    setEditing(null);
                  } else {
                    await createHauler(req);
                  }
                }}
              />
            </div>

            <div className="panel panel--tight">
              <div className="panel-header">
                <h3 className="panel-title">Haulers</h3>
                {loading && (
                  <span className="text-muted mono" style={{ fontSize: 11 }}>
                    Loading…
                  </span>
                )}
              </div>
              {error && <p className="error-text">{error}</p>}
              {!loading && haulers.length === 0 && <p className="text-muted mono">No haulers saved yet.</p>}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {haulers.map((h) => (
                  <div
                    key={h.hauler_id}
                    onClick={() => setSelectedId(h.hauler_id)}
                    style={{
                      cursor: 'pointer',
                      border: '1px solid var(--border-dim)',
                      padding: '10px 12px',
                      ...(h.hauler_id === selectedId ? { outline: '1px solid var(--accent-cyan)', outlineOffset: -1 } : {}),
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <strong>{h.name}</strong>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button
                          className="btn"
                          style={{ padding: '4px 8px', fontSize: 10 }}
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditing(h);
                          }}
                        >
                          Edit
                        </button>
                        <button
                          className="btn btn--danger"
                          style={{ padding: '4px 8px', fontSize: 10 }}
                          onClick={(e) => {
                            e.stopPropagation();
                            void handleDeleteHauler(h);
                          }}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                    <div className="text-muted mono" style={{ fontSize: 11, marginTop: 4 }}>
                      {formatVolume(h.cargo_capacity_m3)} · {formatIsk(h.isk_available)} ·{' '}
                      {h.route_security_profile ?? 'fewest jumps'}
                      {homeSystemName(h) !== null && <> · home: {homeSystemName(h)}</>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div>
            {!selected && <p className="text-muted mono">Select a hauler to see its saved runs.</p>}
            {selected && (
              <>
                <div className="panel-header" style={{ border: 'none', marginBottom: 16 }}>
                  <h3 className="panel-title" style={{ fontSize: 16 }}>
                    {selected.name}'s runs
                  </h3>
                  {runsLoading && (
                    <span className="text-muted mono" style={{ fontSize: 11 }}>
                      Loading…
                    </span>
                  )}
                </div>
                {!runsLoading && runs.length === 0 && (
                  <p className="text-muted mono">
                    No runs saved for this hauler yet -- build one in the Route Planner, or save a single trade from the
                    Arbitrage scanner.
                  </p>
                )}
                {runs.map((run) => (
                  <RunCard
                    key={run.run_id}
                    run={run}
                    onStatusChange={(status) => void updateRunStatus(run.run_id, status)}
                    onDelete={() => void deleteRun(run.run_id)}
                    onLegCompletedChange={(runLegId, completed) => void setLegCompleted(run.run_id, runLegId, completed)}
                    onViewOnMap={setMapFocus}
                  />
                ))}
              </>
            )}
          </div>
        </div>

        {mapFocus && (
          <div className="panel panel--tight" style={{ marginTop: 20 }}>
            <div className="panel-header">
              <h3 className="panel-title">Route on map</h3>
              <button className="btn" onClick={() => setMapFocus(null)}>
                Hide map
              </button>
            </div>
            <GalaxyMap focusRoute={mapFocus} />
          </div>
        )}
      </div>
    </section>
  );
}
