import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './state/AuthContext';
import { SiteHeader } from './components/layout/SiteHeader';
import { SiteFooter } from './components/layout/SiteFooter';
import { HaulersPage } from './components/haulers/HaulersPage';
import { RoutePlannerPage } from './components/haulers/RoutePlannerPage';
import { PriceWatchesPage } from './components/watches/PriceWatchesPage';
import { LoginPage } from './components/auth/LoginPage';
import { RequireRole } from './components/auth/RequireRole';
import { TerminalPage } from './components/terminal/TerminalPage';
import { BrokerPage } from './components/broker/BrokerPage';

// Bazaar/map/landing (PLEX futures, TGI) are parked for now -- this build is
// scoped to arbitrage scanning, route planning, and the trading terminal.
// See SiteHeader for the matching nav trim.
//
// The standalone Arbitrage page (components/arbitrage/ArbitragePage.tsx) is
// retired -- Route Planner's Opportunities tab has the same filter panel and
// grid now (see RoutePlannerPage.tsx). Left on disk rather than deleted;
// /arbitrage redirects here instead of 404ing for anyone with the old link
// bookmarked.
//
// Haulers/Route Planner/Terminal/Broker are role-gated (see RequireRole) --
// freighter/dispatcher/trader/broker respectively, admin bypasses
// everything. Price Watches stays open to any signed-in-or-not visitor.
export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <div className="page">
          <SiteHeader />
          <main>
            <Routes>
              <Route path="/" element={<Navigate to="/route-planner" replace />} />
              <Route path="/arbitrage" element={<Navigate to="/route-planner" replace />} />
              <Route path="/login" element={<LoginPage />} />
              <Route
                path="/haulers"
                element={
                  <RequireRole roles={['freighter', 'dispatcher']}>
                    <HaulersPage />
                  </RequireRole>
                }
              />
              <Route
                path="/route-planner"
                element={
                  <RequireRole roles={['dispatcher']}>
                    <RoutePlannerPage />
                  </RequireRole>
                }
              />
              <Route
                path="/terminal"
                element={
                  <RequireRole roles={['trader']}>
                    <TerminalPage />
                  </RequireRole>
                }
              />
              <Route
                path="/broker"
                element={
                  <RequireRole roles={['broker']}>
                    <BrokerPage />
                  </RequireRole>
                }
              />
              <Route path="/price-watches" element={<PriceWatchesPage />} />
            </Routes>
          </main>
          <SiteFooter />
        </div>
      </BrowserRouter>
    </AuthProvider>
  );
}
