import { AnimatedText } from '@eve-anim/text-animations';
import { GridPulseBackground } from '@eve-anim/grid-pulse';
import { useInstruments } from '../../api/useInstruments';
import { useMarketFeed } from '../../api/useMarketFeed';
import { StatusPill } from '../ui/StatusPill';
import { formatIsk, formatQty } from '../../lib/format';

export function Hero() {
  const { instruments } = useInstruments();
  const { status, books } = useMarketFeed();

  return (
    <section
      id="top"
      className="section"
      style={{ position: 'relative', overflow: 'hidden', paddingTop: 120, paddingBottom: 72 }}
    >
      <GridPulseBackground
        preset="signal-grid"
        overrides={{ background: '#04060c' }}
        style={{ opacity: 0.85 }}
      />
      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at 50% 0%, rgba(4,6,12,0) 0%, #04060c 78%)' }} />

      <div className="section-inner">
        <p className="eyebrow">New Eden // PLEX Derivatives Desk</p>

        <AnimatedText
          as="h1"
          className="hero-heading"
          preset="grow-in-words"
          settingsOverrides={{ text: 'Trade the PLEX market on margin.', trigger: 'mount' }}
          styleOverrides={{ fontSize: 56, textAlign: 'left', color: '#eef4fa' }}
        />

        <AnimatedText
          as="p"
          preset="fade-up-words"
          settingsOverrides={{
            text: 'An independent futures exchange for New Eden — live order books, cross-margined PLEX contracts, and a matching engine built for sub-millisecond fills.',
            trigger: 'mount',
          }}
          styleOverrides={{
            fontSize: 18,
            textAlign: 'left',
            color: 'var(--text-muted)',
            fontFamily: 'var(--font-display)',
            fontWeight: 400,
            lineHeight: 1.55,
          }}
          containerStyle={{ maxWidth: 620, marginTop: 20 }}
        />

        <div style={{ display: 'flex', gap: 16, marginTop: 36, flexWrap: 'wrap' }}>
          <a href="#terminal" className="btn btn--primary">
            Launch Terminal
          </a>
          <a href="#markets" className="btn">
            View Live Markets
          </a>
        </div>

        <div id="markets" style={{ marginTop: 64, scrollMarginTop: 96 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <span className="mono text-muted" style={{ fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase' }}>
              Live Instrument Feed
            </span>
            <StatusPill status={status} />
          </div>

          <div className="panel panel--tight">
            <table>
              <thead>
                <tr>
                  <th>Symbol</th>
                  <th>Type</th>
                  <th>Best Bid</th>
                  <th>Best Ask</th>
                  <th>Contract Size</th>
                </tr>
              </thead>
              <tbody>
                {instruments.length === 0 && (
                  <tr>
                    <td colSpan={5} className="text-muted">
                      Waiting for instrument list from exchange-webapi…
                    </td>
                  </tr>
                )}
                {instruments.map((inst) => {
                  const book = books.get(inst.instrument_id);
                  const bestBid = book?.bids[0];
                  const bestAsk = book?.asks[0];
                  return (
                    <tr key={inst.instrument_id}>
                      <td className="mono" style={{ color: 'var(--text-primary)' }}>
                        {inst.symbol}
                      </td>
                      <td className="text-muted">{inst.instrument_type}</td>
                      <td className="text-buy mono">{bestBid ? formatIsk(bestBid.price) : '—'}</td>
                      <td className="text-sell mono">{bestAsk ? formatIsk(bestAsk.price) : '—'}</td>
                      <td className="text-muted mono">{formatQty(inst.contract_size)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  );
}
