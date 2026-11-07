import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { SiteHeader } from './components/layout/SiteHeader';
import { SiteFooter } from './components/layout/SiteFooter';
import { RoutePlannerPage } from './components/haulers/RoutePlannerPage';
import { MarketBrowser } from './components/market/MarketBrowser';
import { MapPage } from './components/map/MapPage';

// Public, no-login site: route planning + arbitrage scanning (Route
// Planner), market data search (Market), and the galaxy map + routing
// (Map). Everything hits catalog-api / map-api, both fully public --
// there's no auth, no roles, no accounts.
//
// The standalone Arbitrage page is retired -- Route Planner's Opportunities
// tab has the same filter panel and grid. /arbitrage redirects there
// instead of 404ing for anyone with the old link bookmarked.
export default function App() {
  return (
    <BrowserRouter>
      <div className="page">
        <SiteHeader />
        <main>
          <Routes>
            <Route path="/" element={<Navigate to="/route-planner" replace />} />
            <Route path="/arbitrage" element={<Navigate to="/route-planner" replace />} />
            <Route path="/route-planner" element={<RoutePlannerPage />} />
            <Route path="/market" element={<MarketBrowser />} />
            <Route path="/map" element={<MapPage />} />
          </Routes>
        </main>
        <SiteFooter />
      </div>
    </BrowserRouter>
  );
}
