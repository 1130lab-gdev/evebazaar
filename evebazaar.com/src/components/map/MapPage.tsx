import { GalaxyMap } from './GalaxyMap';

/**
 * Site-side glue only -- GalaxyMap itself is a portable, host-agnostic
 * component (see the doc comment at the top of GalaxyMap.tsx) and
 * deliberately doesn't know about evebazaar's `.section`/`.section-inner`
 * page chrome. This wrapper is what makes it look at home on this site,
 * mirroring how MarketBrowser wraps itself for the same routed-page shell.
 */
export function MapPage() {
  return (
    <section className="section" style={{ paddingTop: 32 }}>
      <div className="section-inner">
        <p className="eyebrow">New Eden // Galaxy Map</p>
        <GalaxyMap />
      </div>
    </section>
  );
}
