import type { ConnectionStatus } from '../../api/useMarketFeed';

const LABEL: Record<ConnectionStatus, string> = {
  connecting: 'Connecting',
  open: 'Live',
  closed: 'Reconnecting',
};

const COLOR: Record<ConnectionStatus, string> = {
  connecting: 'var(--accent-amber)',
  open: 'var(--accent-green)',
  closed: 'var(--accent-red)',
};

export function StatusPill({ status }: { status: ConnectionStatus }) {
  const color = COLOR[status];
  return (
    <span
      className="mono"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 7,
        fontSize: 11,
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
        color,
      }}
    >
      <span
        style={{
          width: 7,
          height: 7,
          borderRadius: '50%',
          background: color,
          boxShadow: `0 0 8px ${color}`,
          animation: status === 'connecting' ? 'evebazaar-pulse 1.1s ease-in-out infinite' : undefined,
        }}
      />
      {LABEL[status]}
    </span>
  );
}
