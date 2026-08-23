import { useEffect, useRef, useState } from 'react';
import { WS_BASE_URL } from './client';
import type { MarketEvent, MarketFeedEvent } from './types';

export type ConnectionStatus = 'connecting' | 'open' | 'closed';

export interface Execution {
  id: number;
  instrument_id: number;
  price: number;
  quantity: number;
  receivedAt: number;
}

export interface MarketFeed {
  status: ConnectionStatus;
  /** Latest order-book snapshot per instrument_id, as pushed by /ws/market. */
  books: Map<number, MarketEvent>;
  /** Most recent executions across all instruments, newest first, capped. */
  tape: Execution[];
}

const MAX_TAPE_LENGTH = 50;
const RECONNECT_DELAY_MS = 2000;

/**
 * Subscribes to the public /ws/market feed (order-book updates + trade
 * prints, unauthenticated) and keeps a rolling view of the latest book per
 * instrument plus a capped trade tape. Reconnects automatically on drop.
 */
export function useMarketFeed(): MarketFeed {
  const [status, setStatus] = useState<ConnectionStatus>('connecting');
  const [books, setBooks] = useState<Map<number, MarketEvent>>(new Map());
  const [tape, setTape] = useState<Execution[]>([]);
  const stoppedRef = useRef(false);

  useEffect(() => {
    stoppedRef.current = false;
    let socket: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    const connect = () => {
      if (stoppedRef.current) return;
      setStatus('connecting');
      socket = new WebSocket(`${WS_BASE_URL}/ws/market`);

      socket.addEventListener('open', () => setStatus('open'));

      socket.addEventListener('message', (event) => {
        let parsed: MarketFeedEvent;
        try {
          parsed = JSON.parse(event.data as string) as MarketFeedEvent;
        } catch {
          return;
        }
        if (parsed.type === 'order_book') {
          setBooks((prev) => {
            const next = new Map(prev);
            next.set(parsed.instrument_id, {
              instrument_id: parsed.instrument_id,
              sequence_id: parsed.sequence_id,
              bids: parsed.bids,
              asks: parsed.asks,
            });
            return next;
          });
        } else if (parsed.type === 'execution') {
          setTape((prev) => [{ ...parsed, receivedAt: Date.now() }, ...prev].slice(0, MAX_TAPE_LENGTH));
        }
      });

      socket.addEventListener('close', () => {
        setStatus('closed');
        if (!stoppedRef.current) {
          reconnectTimer = setTimeout(connect, RECONNECT_DELAY_MS);
        }
      });

      socket.addEventListener('error', () => {
        socket?.close();
      });
    };

    connect();

    return () => {
      stoppedRef.current = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      socket?.close();
    };
  }, []);

  return { status, books, tape };
}
