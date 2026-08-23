import { useState } from 'react';
import type { FormEvent } from 'react';
import { useAuth } from '../../state/AuthContext';
import { ORDER_SIDES } from '../../lib/orderSide';
import type { Instrument, OrderSide, OrderType } from '../../api/types';
import { Panel } from '../ui/Panel';
import { ApiError } from '../../api/client';

export function OrderTicketForm({ instrument }: { instrument: Instrument }) {
  const { submitOrder } = useAuth();
  const [side, setSide] = useState<OrderSide>('buy_open');
  const [orderType, setOrderType] = useState<OrderType>('limit');
  const [price, setPrice] = useState('');
  const [quantity, setQuantity] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'error'; message: string } | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const qty = Number(quantity);
    const px = orderType === 'market' ? 0 : Number(price);
    if (!Number.isFinite(qty) || qty <= 0) {
      setFeedback({ kind: 'error', message: 'Quantity must be a positive number.' });
      return;
    }
    if (orderType === 'limit' && (!Number.isFinite(px) || px <= 0)) {
      setFeedback({ kind: 'error', message: 'Limit orders need a positive price.' });
      return;
    }

    setSubmitting(true);
    setFeedback(null);
    try {
      const order = await submitOrder({
        instrument_id: instrument.instrument_id,
        order_type: orderType,
        order_side: side,
        price: px,
        quantity: qty,
      });
      setFeedback({ kind: 'ok', message: `Order #${order.id} ${order.order_status}.` });
      setQuantity('');
      if (orderType === 'limit') setPrice('');
    } catch (err) {
      setFeedback({ kind: 'error', message: err instanceof ApiError ? err.message : 'Order submission failed.' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Panel title={`Order Ticket · ${instrument.symbol}`}>
      <form onSubmit={handleSubmit}>
        <div className="field">
          <label htmlFor="order-side">Side</label>
          <select id="order-side" value={side} onChange={(e) => setSide(e.target.value as OrderSide)}>
            {ORDER_SIDES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label htmlFor="order-type">Type</label>
          <select id="order-type" value={orderType} onChange={(e) => setOrderType(e.target.value as OrderType)}>
            <option value="limit">Limit</option>
            <option value="market">Market</option>
          </select>
        </div>

        <div className="field">
          <label htmlFor="order-price">Price {orderType === 'market' && '(ignored for market orders)'}</label>
          <input
            id="order-price"
            type="number"
            min="0"
            step={instrument.tick_size || 1}
            disabled={orderType === 'market'}
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder="0"
          />
        </div>

        <div className="field">
          <label htmlFor="order-qty">Quantity (contracts)</label>
          <input
            id="order-qty"
            type="number"
            min="1"
            step="1"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            placeholder="0"
          />
        </div>

        <button type="submit" className="btn btn--primary btn--full" disabled={submitting}>
          {submitting ? 'Submitting…' : 'Submit Order'}
        </button>

        {feedback && (
          <p
            className="mono"
            style={{
              marginBottom: 0,
              marginTop: 12,
              fontSize: 13,
              color: feedback.kind === 'ok' ? 'var(--accent-green)' : 'var(--accent-red)',
            }}
          >
            {feedback.message}
          </p>
        )}
      </form>
    </Panel>
  );
}
