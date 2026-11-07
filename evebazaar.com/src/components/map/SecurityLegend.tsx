import { securityColor } from '../../lib/securityColor';

// Three flat bands rather than the full graduated scale -- enough to read
// the map at a glance when the legend is overlaid on the canvas.
const BANDS: { label: string; sec: number }[] = [
  { label: 'High', sec: 0.5 },
  { label: 'Low', sec: 0.3 },
  { label: 'Null', sec: 0.0 },
];

export function SecurityLegend() {
  return (
    <div className="legend">
      <div className="legend-swatches">
        {BANDS.map((b) => (
          <div key={b.label} className="legend-swatch">
            <span className="legend-dot" style={{ background: securityColor(b.sec) }} />
            <span className="mono">{b.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
