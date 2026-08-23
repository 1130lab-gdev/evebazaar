import { Hero } from './Hero';
import { FeatureGrid } from './FeatureGrid';
import { TerminalSection } from '../terminal/TerminalSection';

export function LandingPage() {
  return (
    <>
      <Hero />
      <FeatureGrid />
      <TerminalSection />
    </>
  );
}
