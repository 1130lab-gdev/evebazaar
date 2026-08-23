// Graduated by real security_status (-1.0..1.0), not bucketed into 3 flat
// colors -- matches dotlan/EVE's own convention. Built from evebazaar.com's
// existing accent palette (cyan/green/amber/red) rather than new colors, so
// this reads consistently if/when it's promoted there.
const STOPS: { sec: number; rgb: [number, number, number] }[] = [
  { sec: 1.0, rgb: [0, 229, 255] }, // accent-cyan -- true high-sec core
  { sec: 0.5, rgb: [57, 255, 201] }, // accent-green -- high-sec floor
  { sec: 0.45, rgb: [217, 164, 65] }, // accent-amber -- low-sec ceiling
  { sec: 0.0, rgb: [255, 77, 109] }, // accent-red -- low-sec floor / null-sec ceiling
  { sec: -1.0, rgb: [92, 22, 38] }, // deep null-sec
];

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function securityColor(securityStatus: number): string {
  const sec = Math.max(-1, Math.min(1, securityStatus));
  for (let i = 0; i < STOPS.length - 1; i++) {
    const hi = STOPS[i];
    const lo = STOPS[i + 1];
    if (sec <= hi.sec && sec >= lo.sec) {
      const span = hi.sec - lo.sec || 1;
      const t = (hi.sec - sec) / span;
      const rgb = hi.rgb.map((channel, idx) => Math.round(lerp(channel, lo.rgb[idx], t)));
      return `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
    }
  }
  const last = STOPS[STOPS.length - 1].rgb;
  return `rgb(${last[0]}, ${last[1]}, ${last[2]})`;
}
