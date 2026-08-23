import { useEffect, useRef, useState } from 'react';
import { AnimatedText } from '@eve-anim/text-animations';
import { usePriceWatches } from '../../api/catalog/usePriceWatches';
import { ItemSearchBox } from '../market/ItemSearchBox';
import { PriceWatchRow } from './PriceWatchRow';
import { formatIsk } from '../../lib/format';
import type { SearchResult } from '../../api/catalog/types';

const DEFAULT_THRESHOLD_PCT = 10;

/** Fires a native browser notification the moment a watch transitions
 * into `triggered`, not on every poll it stays triggered -- tracked via a
 * ref (not state) since remembering "have I already notified for this"
 * shouldn't itself trigger a re-render. Resets a watch's flag once it
 * un-triggers, so it can notify again if it crosses the threshold a
 * second time later. */
function useTriggerNotifications(watches: { watch_id: number; type_name: string; triggered: boolean; current_price: number | null }[]) {
  const notifiedRef = useRef<Set<number>>(new Set());

  useEffect(() => {
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    for (const w of watches) {
      const alreadyNotified = notifiedRef.current.has(w.watch_id);
      if (w.triggered && !alreadyNotified) {
        notifiedRef.current.add(w.watch_id);
        new Notification('Price watch triggered', {
          body: `${w.type_name} is now buying at ${w.current_price !== null ? formatIsk(w.current_price) : 'an unknown price'}.`,
          tag: `price-watch-${w.watch_id}`,
        });
      } else if (!w.triggered && alreadyNotified) {
        notifiedRef.current.delete(w.watch_id);
      }
    }
  }, [watches]);
}

export function PriceWatchesPage() {
  const { watches, loading, error, createWatch, updateWatch, deleteWatch } = usePriceWatches();
  const [selectedItem, setSelectedItem] = useState<SearchResult | null>(null);
  const [referencePrice, setReferencePrice] = useState('');
  const [thresholdPct, setThresholdPct] = useState(String(DEFAULT_THRESHOLD_PCT));
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [notifyPermission, setNotifyPermission] = useState<NotificationPermission | 'unsupported'>(
    typeof Notification === 'undefined' ? 'unsupported' : Notification.permission,
  );

  useTriggerNotifications(watches);

  const canCreate = selectedItem !== null && Number(referencePrice) > 0 && Number(thresholdPct) >= 0;

  async function handleCreate() {
    if (selectedItem === null) return;
    setCreating(true);
    setCreateError(null);
    try {
      await createWatch({ type_id: selectedItem.type_id, reference_price: Number(referencePrice), threshold_pct: Number(thresholdPct) });
      setSelectedItem(null);
      setReferencePrice('');
      setThresholdPct(String(DEFAULT_THRESHOLD_PCT));
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Failed to create watch.');
    } finally {
      setCreating(false);
    }
  }

  async function requestNotifyPermission() {
    const result = await Notification.requestPermission();
    setNotifyPermission(result);
  }

  const triggeredCount = watches.filter((w) => w.triggered).length;

  return (
    <section className="section" style={{ paddingTop: 140 }}>
      <div className="section-inner">
        <p className="eyebrow">New Eden // Price Watches</p>
        <AnimatedText
          as="h2"
          className="section-heading"
          preset="fade-up-words"
          settingsOverrides={{ text: 'Know when it turns around.' }}
          styleOverrides={{ fontSize: 34, textAlign: 'left', color: '#eef4fa' }}
        />

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 0.85fr) minmax(0, 2.15fr)',
            gap: 20,
            marginTop: 24,
            alignItems: 'start',
          }}
        >
          <div className="panel panel--tight" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="panel-header" style={{ border: 'none', padding: 0, marginBottom: 0 }}>
              <h3 className="panel-title" style={{ fontSize: 14 }}>
                New watch
              </h3>
            </div>

            <ItemSearchBox onSelect={setSelectedItem} />

            <div className="field" style={{ margin: 0 }}>
              <label>Reference price, ISK</label>
              <input
                type="number"
                placeholder="e.g. what you paid"
                value={referencePrice}
                onChange={(e) => setReferencePrice(e.target.value)}
              />
            </div>

            <div className="field" style={{ margin: 0 }}>
              <label>Alert threshold, %</label>
              <input type="number" step="any" value={thresholdPct} onChange={(e) => setThresholdPct(e.target.value)} />
              <p className="field-help" style={{ margin: '6px 0 0' }}>
                Triggers once the best live buy order anywhere clears reference price + this percent -- "what would
                someone pay me for this right now."
              </p>
            </div>

            {createError && <p className="error-text">{createError}</p>}
            <button className="btn btn--primary btn--full" disabled={!canCreate || creating} onClick={() => void handleCreate()}>
              {creating ? 'Adding…' : 'Add watch'}
            </button>

            <div className="panel-header" style={{ border: 'none', padding: 0, marginBottom: 0, marginTop: 8 }}>
              <h3 className="panel-title" style={{ fontSize: 14 }}>
                Notifications
              </h3>
            </div>
            {notifyPermission === 'unsupported' && (
              <p className="text-muted mono" style={{ fontSize: 11 }}>
                This browser doesn't support notifications -- watches still show as triggered on this page.
              </p>
            )}
            {notifyPermission === 'granted' && (
              <p className="text-muted mono" style={{ fontSize: 11 }}>
                Enabled -- you'll get a browser notification the moment a watch triggers, as long as this tab stays
                open.
              </p>
            )}
            {notifyPermission === 'denied' && (
              <p className="text-muted mono" style={{ fontSize: 11 }}>
                Blocked in this browser's settings -- watches still show as triggered on this page.
              </p>
            )}
            {notifyPermission === 'default' && (
              <button className="btn btn--full" onClick={() => void requestNotifyPermission()}>
                Enable browser notifications
              </button>
            )}
          </div>

          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <h3 className="panel-title" style={{ fontSize: 14, margin: 0 }}>
                Watches
              </h3>
              {loading && (
                <span className="text-muted mono" style={{ fontSize: 11 }}>
                  Loading…
                </span>
              )}
              {!loading && triggeredCount > 0 && (
                <span className="mono" style={{ fontSize: 11, color: 'var(--accent-red)' }}>
                  {triggeredCount} triggered
                </span>
              )}
            </div>
            {error && <p className="error-text">{error}</p>}
            {!loading && watches.length === 0 && !error && (
              <p className="text-muted mono">No price watches yet -- add one to get alerted when an item's worth selling.</p>
            )}
            {watches.map((w) => (
              <PriceWatchRow
                key={w.watch_id}
                watch={w}
                onSave={(referencePriceValue, thresholdPctValue) =>
                  updateWatch(w.watch_id, { reference_price: referencePriceValue, threshold_pct: thresholdPctValue }).then(() => undefined)
                }
                onDelete={() => void deleteWatch(w.watch_id)}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
