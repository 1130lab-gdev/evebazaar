import { useMemo, useState } from 'react';
import { presets, getPreset } from './core/presets';
import { mergeTextAnimationSettings, mergeTextStyle } from './core/config';
import { AnimatedText } from './react/AnimatedText';
import { ControlPanel } from './ControlPanel';
import type { TextAnimationSettings, TextStyle } from './core/types';
import './App.css';

function App() {
  const [presetId, setPresetId] = useState(presets[0].id);
  const [settingsOverrides, setSettingsOverrides] = useState<Partial<TextAnimationSettings>>({});
  const [styleOverrides, setStyleOverrides] = useState<Partial<TextStyle>>({});
  const [resetKey, setResetKey] = useState(0);
  const [copied, setCopied] = useState(false);

  const preset = getPreset(presetId)!;
  const settings = useMemo(
    () => mergeTextAnimationSettings(preset.settings, settingsOverrides),
    [preset, settingsOverrides],
  );
  const style = useMemo(() => mergeTextStyle(preset.style, styleOverrides), [preset, styleOverrides]);

  const handlePresetChange = (id: string) => {
    setPresetId(id);
    setSettingsOverrides({});
    setStyleOverrides({});
    setResetKey((k) => k + 1);
  };

  const handleSettingsChange = (patch: Partial<TextAnimationSettings>) => {
    setSettingsOverrides((prev) => ({ ...prev, ...patch }));
  };

  const handleStyleChange = (patch: Partial<TextStyle>) => {
    setStyleOverrides((prev) => ({ ...prev, ...patch }));
  };

  const handleReplay = () => setResetKey((k) => k + 1);

  const hasOverrides = Object.keys(settingsOverrides).length > 0 || Object.keys(styleOverrides).length > 0;
  const embedSnippet = useMemo(() => {
    const attrs = hasOverrides
      ? `settings='${JSON.stringify(settings)}' text-style='${JSON.stringify(style)}'`
      : `preset="${presetId}"`;
    return ['<script src="https://YOUR-DOMAIN/text-animations.js"></script>', `<text-anim ${attrs}></text-anim>`].join(
      '\n',
    );
  }, [presetId, settings, style, hasOverrides]);

  const copySnippet = async () => {
    await navigator.clipboard.writeText(embedSnippet);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="app">
      <aside className="sidebar">
        <h1>Text Animations</h1>
        <p className="subtitle">Text reveal component playground</p>

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

        <ControlPanel
          settings={settings}
          style={style}
          onSettingsChange={handleSettingsChange}
          onStyleChange={handleStyleChange}
        />

        <button className="randomize-btn" onClick={handleReplay}>
          Replay animation
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
          <div className="scroll-hint">
            {settings.trigger === 'inView' ? '↓ Scroll to trigger the animation' : 'Trigger: immediately on mount'}
          </div>
          <div className="text-stage-spacer" aria-hidden="true" />
          <AnimatedText
            key={`${presetId}-${resetKey}`}
            settings={settings}
            style={style}
            as="h2"
            className="demo-text"
          />
          <div className="text-stage-spacer" aria-hidden="true" />
        </section>
      </main>
    </div>
  );
}

export default App;
