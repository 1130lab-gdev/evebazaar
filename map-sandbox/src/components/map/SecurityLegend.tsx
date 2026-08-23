import { securityColor } from '../../lib/securityColor';

const STOPS = [1.0, 0.8, 0.6, 0.5, 0.4, 0.2, 0.0, -0.5, -1.0];

export function SecurityLegend() {
  return (
    <div className="legend">
      <label>security</label>
      <div className="legend-swatches">
        {STOPS.map((s) => (
          <div key={s} className="legend-swatch" title={s.toFixed(1)}>
            <span className="legend-dot" style={{ background: securityColor(s) }} />
            <span className="mono">{s.toFixed(1)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
