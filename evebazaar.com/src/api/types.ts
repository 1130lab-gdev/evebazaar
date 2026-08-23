// Mirrors ../../../exchange-webapi/src/domain.rs. Keep in sync with that file.

export type OrderType = 'unknown' | 'market' | 'limit';

export type OrderSide = 'unknown' | 'buy_open' | 'sell_close' | 'sell_open' | 'buy_close';

export type OrderStatus =
  | 'unknown'
  | 'opening'
  | 'open'
  | 'cancelling'
  | 'cancelled'
  | 'filled'
  | 'rejected'
  | 'expired';

export interface Order {
  id: number;
  user_id: number;
  instrument_id: number;
  sequence_id: number | null;
  order_type: OrderType;
  order_side: OrderSide;
  order_status: OrderStatus;
  price: number;
  quantity: number;
  filled_quantity: number;
  created_at: string;
  updated_at: string;
}

export interface SubmitOrderRequest {
  instrument_id: number;
  order_type: OrderType;
  order_side: OrderSide;
  /** Ignored (should be 0) for market orders. */
  price: number;
  quantity: number;
}

export interface Instrument {
  instrument_id: number;
  symbol: string;
  instrument_type: string;
  status: string;
  tick_size: number;
  contract_size: number;
}

export interface BookLevel {
  price: number;
  quantity: number;
}

export interface MarketEvent {
  instrument_id: number;
  sequence_id: number;
  bids: BookLevel[];
  asks: BookLevel[];
}

export type MarketFeedEvent =
  | ({ type: 'order_book' } & MarketEvent)
  | { type: 'execution'; id: number; instrument_id: number; price: number; quantity: number };

export type UserRole = 'freighter' | 'dispatcher' | 'trader' | 'broker' | 'admin';

export type UserStatus = 'unknown' | 'active' | 'suspended' | 'closed';

/** The caller's own identity, as returned by `GET /me`. */
export interface User {
  id: number;
  username: string;
  status: UserStatus;
  role: UserRole;
  created_by_broker_id: number | null;
}

/** Mirrors exchange-webapi/src/routes/broker.rs. */
export interface CreateTraderRequest {
  username: string;
}

export interface CreateTraderResponse {
  id: number;
  username: string;
  /** Shown exactly once -- only its SHA-256 hash is stored. */
  api_key: string;
}

export interface ApiErrorBody {
  error?: string;
  message?: string;
}
