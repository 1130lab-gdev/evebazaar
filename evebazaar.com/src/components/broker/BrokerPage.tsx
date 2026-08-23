import { useMemo } from 'react';
import { AnimatedText } from '@eve-anim/text-animations';
import { useBroker } from '../../state/useBroker';
import { CreateTraderForm } from './CreateTraderForm';
import { BrokerOrdersPanel } from './BrokerOrdersPanel';

export function BrokerPage() {
  const { orders, traders, loading, error, createTrader, cancelOrder } = useBroker();
  const traderNames = useMemo(() => new Map(traders.map((t) => [t.id, t.username])), [traders]);

  return (
    <section className="section" style={{ paddingTop: 140 }}>
      <div className="section-inner">
        <p className="eyebrow">Eve Bazaar // Broker Desk</p>
        <AnimatedText
          as="h2"
          className="section-heading"
          preset="fade-up-words"
          settingsOverrides={{ text: 'Your traders, your book.' }}
          styleOverrides={{ fontSize: 34, textAlign: 'left', color: '#eef4fa' }}
        />

        <div
          style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 0.85fr) minmax(0, 2.15fr)', gap: 20, marginTop: 24, alignItems: 'start' }}
        >
          <CreateTraderForm onCreate={createTrader} />
          <BrokerOrdersPanel orders={orders} loading={loading} error={error} traderNames={traderNames} onCancel={cancelOrder} />
        </div>
      </div>
    </section>
  );
}
