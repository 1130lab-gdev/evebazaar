import { useEffect, useState } from 'react';
import { AnimatedText } from '@eve-anim/text-animations';
import { useInstruments } from '../../api/useInstruments';
import { useMarketFeed } from '../../api/useMarketFeed';
import { useAuth } from '../../state/AuthContext';
import { OrderBookPanel } from './OrderBookPanel';
import { TradeTapePanel } from './TradeTapePanel';
import { OrderTicketForm } from './OrderTicketForm';
import { OrderHistoryPanel } from './OrderHistoryPanel';
import { LoginForm } from '../auth/LoginForm';

export function TerminalSection() {
  const { instruments } = useInstruments();
  const { status, books, tape } = useMarketFeed();
  const { status: authStatus } = useAuth();
  const [selectedId, setSelectedId] = useState<number | null>(null);

  useEffect(() => {
    if (selectedId === null && instruments.length > 0) {
      setSelectedId(instruments[0].instrument_id);
    }
  }, [instruments, selectedId]);

  const selected = instruments.find((i) => i.instrument_id === selectedId) ?? null;
  const book = selectedId !== null ? books.get(selectedId) : undefined;
  const instrumentTape = selectedId !== null ? tape.filter((e) => e.instrument_id === selectedId) : [];

  return (
    <section id="terminal" className="section" style={{ paddingTop: 140 }}>
      <div className="section-inner">
        <p className="eyebrow">Live Terminal</p>
        <AnimatedText
          as="h2"
          className="section-heading"
          preset="fade-up-words"
          settingsOverrides={{ text: 'One book, priced and matched in real time.' }}
          styleOverrides={{ fontSize: 34, textAlign: 'left', color: '#eef4fa' }}
        />

        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 32, marginBottom: 28, flexWrap: 'wrap' }}>
          <label htmlFor="instrument-select" style={{ margin: 0 }}>
            Instrument
          </label>
          <select
            id="instrument-select"
            style={{ width: 'auto', minWidth: 220 }}
            value={selectedId ?? ''}
            onChange={(e) => setSelectedId(Number(e.target.value))}
          >
            {instruments.length === 0 && <option value="">Loading…</option>}
            {instruments.map((inst) => (
              <option key={inst.instrument_id} value={inst.instrument_id}>
                {inst.symbol} — {inst.instrument_type}
              </option>
            ))}
          </select>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1.1fr) minmax(0, 0.9fr)',
            gap: 20,
            alignItems: 'start',
          }}
          className="terminal-grid"
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <OrderBookPanel book={book} status={status} />
            <TradeTapePanel executions={instrumentTape} />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {authStatus === 'signed_in' ? (
              <>
                {selected && <OrderTicketForm instrument={selected} />}
                <OrderHistoryPanel />
              </>
            ) : (
              <LoginForm />
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
