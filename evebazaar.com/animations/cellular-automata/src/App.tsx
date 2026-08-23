import { useMemo, useState } from 'react';
import { presets, getPreset } from './core/presets';
import { mergeAutomatonConfig } from './core/config';
import { CellularAutomataBackground } from './react/CellularAutomataBackground';
import { ControlPanel } from './ControlPanel';
import type { AutomatonConfig } from './core/types';
import './App.css';

function App() {
  const [presetId, setPresetId] = useState(presets[0].id);
  const [overrides, setOverrides] = useState<Partial<AutomatonConfig>>({});
  const [resetKey, setResetKey] = useState(0);
  const [copied, setCopied] = useState(false);

  const preset = getPreset(presetId)!;
  const config = useMemo(() => mergeAutomatonConfig(preset.config, overrides), [preset, overrides]);

  const handlePresetChange = (id: string) => {
    setPresetId(id);
    setOverrides({});
    setResetKey((k) => k + 1);
  };

  const handleChange = (patch: Partial<AutomatonConfig>) => {
    setOverrides((prev) => ({
      ...prev,
      ...patch,
      params: { ...prev.params, ...patch.params } as AutomatonConfig['params'],
    }));
  };

  const handleRandomize = () => setResetKey((k) => k + 1);

  const hasOverrides = Object.keys(overrides).length > 0;
  const embedSnippet = useMemo(() => {
    const attrs = hasOverrides ? `config='${JSON.stringify(config)}'` : `preset="${presetId}"`;
    return [
      '<script src="https://YOUR-DOMAIN/cellular-automata.js"></script>',
      '<div style="position:relative; width:100%; height:480px;">',
      `  <cellular-automata-bg ${attrs}></cellular-automata-bg>`,
      '  <!-- your content goes here, on top -->',
      '</div>',
    ].join('\n');
  }, [presetId, config, hasOverrides]);

  const copySnippet = async () => {
    await navigator.clipboard.writeText(embedSnippet);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="app">
      <aside className="sidebar">
        <h1>Cellular Automata</h1>
        <p className="subtitle">Background component playground</p>

        <div className="field">
          <span className="field-label">Preset</span>
          <select value={presetId} onChange={(e) => handlePresetChange(e.target.value)}>
            {presets.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <p className="preset-description">{preset.description}</p>

        <ControlPanel config={config} onChange={handleChange} />

        <button className="randomize-btn" onClick={handleRandomize}>
          Randomize seed
        </button>

        <hr />

        <div className="field">
          <span className="field-label">WordPress embed snippet</span>
          <pre className="snippet">{embedSnippet}</pre>
          <button onClick={copySnippet}>{copied ? 'Copied!' : 'Copy snippet'}</button>
        </div>
      </aside>

      <main className="stage">
        <section className="hero-demo">
          <CellularAutomataBackground key={`${presetId}-${resetKey}`} config={config} />
          <div className="hero-content">
            <h2>Your Hero Content</h2>
            <p>
              This box has position: relative. The automaton fills it as an absolutely positioned background
              layer.
            </p>
            <button className="cta">Call to action</button>
          </div>
        </section>
      </main>
    </div>
  );
}

export default App;
