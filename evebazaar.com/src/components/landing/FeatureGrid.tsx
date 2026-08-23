import { AnimatedText } from '@eve-anim/text-animations';
import { CellularAutomataBackground } from '@eve-anim/cellular-automata';
import { Panel } from '../ui/Panel';

const FEATURES = [
  {
    title: 'Matching Engine',
    body: 'A price-time priority order book written in Rust, with every fill journaled and replay-tested — the same engine, driven from a recorded log, must reproduce the exact book it produced live.',
  },
  {
    title: 'Pre-Trade Risk',
    body: 'Every order clears a margin check against the risk service before it ever reaches the book. PLEX futures trade at 10x leverage, marked against live ESI market data and swept continuously for exposure.',
  },
  {
    title: 'Binary Gateway Protocol',
    body: 'The webapi, matcher, and risk service talk over a Cap’n Proto schema — a compact binary wire format built for the order and market-data path, not a REST call in sight between them.',
  },
  {
    title: 'Public & Scoped Feeds',
    body: 'Order books and trade prints stream openly over /ws/market for anyone watching the tape. Your own order lifecycle is scoped to a per-user API key, hashed at rest and never stored in the clear.',
  },
];

export function FeatureGrid() {
  return (
    <section id="features" className="section" style={{ borderTop: '1px solid var(--border-dim)' }}>
      <div className="section-inner">
        <p className="eyebrow">System Architecture</p>
        <AnimatedText
          as="h2"
          className="section-heading"
          preset="fade-up-words"
          settingsOverrides={{ text: 'Built like exchange infrastructure, not a spreadsheet.' }}
          styleOverrides={{ fontSize: 34, textAlign: 'left', color: '#eef4fa' }}
        />
        <p className="section-lede">
          Four services — a matcher, a risk engine, a web API, and a shared binary protocol — do the work behind
          every order on this page.
        </p>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
            gap: 20,
            marginTop: 44,
          }}
        >
          {FEATURES.map((f) => (
            <Panel key={f.title} title={f.title}>
              <p className="text-muted" style={{ fontSize: 14, lineHeight: 1.6, margin: 0 }}>
                {f.body}
              </p>
            </Panel>
          ))}
        </div>
      </div>

      <div style={{ position: 'relative', height: 96, marginTop: 72, overflow: 'hidden' }}>
        <CellularAutomataBackground preset="hypolayer-signal" style={{ opacity: 0.55 }} />
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'linear-gradient(90deg, #04060c 0%, rgba(4,6,12,0) 18%, rgba(4,6,12,0) 82%, #04060c 100%)',
          }}
        />
      </div>
    </section>
  );
}
