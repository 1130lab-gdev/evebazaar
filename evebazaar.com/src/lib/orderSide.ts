import type { OrderSide, OrderStatus } from '../api/types';

export const ORDER_SIDES: { value: OrderSide; label: string; direction: 'long' | 'short' }[] = [
  { value: 'buy_open', label: 'Buy to Open (Long)', direction: 'long' },
  { value: 'sell_close', label: 'Sell to Close (Long)', direction: 'long' },
  { value: 'sell_open', label: 'Sell to Open (Short)', direction: 'short' },
  { value: 'buy_close', label: 'Buy to Close (Short)', direction: 'short' },
];

export function orderSideLabel(side: OrderSide): string {
  return ORDER_SIDES.find((s) => s.value === side)?.label ?? side;
}

/** Whether the side is a bid-side (buying) action, for book/tape color coding. */
export function isBuySide(side: OrderSide): boolean {
  return side === 'buy_open' || side === 'buy_close';
}

export function orderStatusLabel(status: OrderStatus): string {
  switch (status) {
    case 'opening':
      return 'Opening';
    case 'open':
      return 'Open';
    case 'cancelling':
      return 'Cancelling';
    case 'cancelled':
      return 'Cancelled';
    case 'filled':
      return 'Filled';
    case 'rejected':
      return 'Rejected';
    case 'expired':
      return 'Expired';
    default:
      return 'Unknown';
  }
}
