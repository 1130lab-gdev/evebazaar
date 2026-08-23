import type { ReactNode } from 'react';
import type {
  AnimationTrigger,
  CursorStyle,
  GrowOrigin,
  SplitUnit,
  TextAlign,
  TextAnimationConfig,
  TextAnimationSettings,
  TextStyle,
  TypewriterAnimationConfig,
  TypewriterCursorConfig,
} from './core/types';

interface ControlPanelProps {
  settings: TextAnimationSettings;
  style: TextStyle;
  onSettingsChange: (patch: Partial<TextAnimationSettings>) => void;
  onStyleChange: (patch: Partial<TextStyle>) => void;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
    </label>
  );
}

const SPLIT_OPTIONS: Array<{ value: SplitUnit; label: string }> = [
  { value: 'chars', label: 'Characters' },
  { value: 'words', label: 'Words' },
  { value: 'lines', label: 'Lines' },
];

const TRIGGER_OPTIONS: Array<{ value: AnimationTrigger; label: string }> = [
  { value: 'inView', label: 'When scrolled into view' },
  { value: 'mount', label: 'Immediately on mount' },
];

const ORIGIN_OPTIONS: Array<{ value: GrowOrigin; label: string }> = [
  { value: 'center', label: 'Center' },
  { value: 'bottom', label: 'Bottom' },
  { value: 'top', label: 'Top' },
  { value: 'left', label: 'Left' },
  { value: 'right', label: 'Right' },
];

const CURSOR_STYLE_OPTIONS: Array<{ value: CursorStyle; label: string }> = [
  { value: 'bar', label: 'Bar ( | )' },
  { value: 'block', label: 'Block ( █ )' },
  { value: 'underscore', label: 'Underscore ( _ )' },
];

const TEXT_ALIGN_OPTIONS: Array<{ value: TextAlign; label: string }> = [
  { value: 'left', label: 'Left' },
  { value: 'center', label: 'Center' },
  { value: 'right', label: 'Right' },
];

const EASING_OPTIONS = [
  { value: 'ease-out', label: 'Ease out' },
  { value: 'ease-in-out', label: 'Ease in-out' },
  { value: 'linear', label: 'Linear' },
  { value: 'cubic-bezier(.2,.8,.2,1)', label: 'Smooth' },
  { value: 'cubic-bezier(.22,1,.36,1)', label: 'Decelerate' },
  { value: 'cubic-bezier(.34,1.56,.64,1)', label: 'Bounce' },
  { value: 'cubic-bezier(.68,-0.55,.27,1.55)', label: 'Springy' },
];

export function ControlPanel({ settings, style, onSettingsChange, onStyleChange }: ControlPanelProps) {
  const animation = settings.animation;

  const updateAnimation = (patch: Partial<TextAnimationConfig>) => {
    onSettingsChange({ animation: { ...animation, ...patch } as TextAnimationConfig });
  };

  const updateCursor = (patch: Partial<TypewriterCursorConfig>) => {
    if (animation.kind !== 'typewriter') return;
    onSettingsChange({
      animation: { ...animation, cursor: { ...animation.cursor, ...patch } } as TypewriterAnimationConfig,
    });
  };

  return (
    <div className="control-panel">
      <Field label="Text">
        <textarea
          rows={3}
          value={settings.text}
          onChange={(e) => onSettingsChange({ text: e.target.value })}
        />
      </Field>

      <Field label="Trigger">
        <select value={settings.trigger} onChange={(e) => onSettingsChange({ trigger: e.target.value as AnimationTrigger })}>
          {TRIGGER_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Loop">
        <input type="checkbox" checked={settings.loop} onChange={(e) => onSettingsChange({ loop: e.target.checked })} />
      </Field>

      {settings.loop && (
        <Field label={`Hold before looping: ${settings.loopDelayMs}ms`}>
          <input
            type="range"
            min={0}
            max={4000}
            step={100}
            value={settings.loopDelayMs}
            onChange={(e) => onSettingsChange({ loopDelayMs: Number(e.target.value) })}
          />
        </Field>
      )}

      <hr />
      <div className="layer-title">Type style</div>

      <Field label={`Font size: ${style.fontSize}px`}>
        <input
          type="range"
          min={12}
          max={96}
          value={style.fontSize}
          onChange={(e) => onStyleChange({ fontSize: Number(e.target.value) })}
        />
      </Field>
      <Field label={`Font weight: ${style.fontWeight}`}>
        <input
          type="range"
          min={100}
          max={900}
          step={100}
          value={style.fontWeight}
          onChange={(e) => onStyleChange({ fontWeight: Number(e.target.value) })}
        />
      </Field>
      <Field label="Color">
        <input type="color" value={style.color} onChange={(e) => onStyleChange({ color: e.target.value })} />
      </Field>
      <Field label="Align">
        <select value={style.textAlign} onChange={(e) => onStyleChange({ textAlign: e.target.value as TextAlign })}>
          {TEXT_ALIGN_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </Field>
      <Field label={`Letter spacing: ${style.letterSpacing}px`}>
        <input
          type="range"
          min={-2}
          max={20}
          step={0.5}
          value={style.letterSpacing}
          onChange={(e) => onStyleChange({ letterSpacing: Number(e.target.value) })}
        />
      </Field>
      <Field label={`Line height: ${style.lineHeight.toFixed(2)}`}>
        <input
          type="range"
          min={0.9}
          max={2}
          step={0.05}
          value={style.lineHeight}
          onChange={(e) => onStyleChange({ lineHeight: Number(e.target.value) })}
        />
      </Field>

      <hr />
      <div className="layer-title">
        {animation.kind === 'fade' && 'Fade animation'}
        {animation.kind === 'grow' && 'Grow animation'}
        {animation.kind === 'typewriter' && 'Typewriter animation'}
      </div>

      {(animation.kind === 'fade' || animation.kind === 'grow') && (
        <>
          <Field label="Split by">
            <select value={animation.splitBy} onChange={(e) => updateAnimation({ splitBy: e.target.value as SplitUnit })}>
              {SPLIT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label={`Duration: ${animation.durationMs}ms`}>
            <input
              type="range"
              min={100}
              max={2000}
              step={50}
              value={animation.durationMs}
              onChange={(e) => updateAnimation({ durationMs: Number(e.target.value) })}
            />
          </Field>
          <Field label={`Stagger: ${animation.staggerMs}ms`}>
            <input
              type="range"
              min={0}
              max={400}
              step={5}
              value={animation.staggerMs}
              onChange={(e) => updateAnimation({ staggerMs: Number(e.target.value) })}
            />
          </Field>
          <Field label="Easing">
            <select value={animation.easing} onChange={(e) => updateAnimation({ easing: e.target.value })}>
              {EASING_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </Field>
        </>
      )}

      {animation.kind === 'fade' && (
        <>
          <Field label={`Start opacity: ${animation.startOpacity.toFixed(2)}`}>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={animation.startOpacity}
              onChange={(e) => updateAnimation({ startOpacity: Number(e.target.value) })}
            />
          </Field>
          <Field label={`Rise from: ${animation.translateY}px`}>
            <input
              type="range"
              min={-60}
              max={60}
              value={animation.translateY}
              onChange={(e) => updateAnimation({ translateY: Number(e.target.value) })}
            />
          </Field>
          <Field label={`Drift from: ${animation.translateX}px`}>
            <input
              type="range"
              min={-60}
              max={60}
              value={animation.translateX}
              onChange={(e) => updateAnimation({ translateX: Number(e.target.value) })}
            />
          </Field>
        </>
      )}

      {animation.kind === 'grow' && (
        <>
          <Field label={`Start scale: ${animation.startScale.toFixed(2)}`}>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={animation.startScale}
              onChange={(e) => updateAnimation({ startScale: Number(e.target.value) })}
            />
          </Field>
          <Field label={`Start blur: ${animation.blurPx}px`}>
            <input
              type="range"
              min={0}
              max={24}
              value={animation.blurPx}
              onChange={(e) => updateAnimation({ blurPx: Number(e.target.value) })}
            />
          </Field>
          <Field label="Also fade opacity">
            <input type="checkbox" checked={animation.fade} onChange={(e) => updateAnimation({ fade: e.target.checked })} />
          </Field>
          <Field label="Scale origin">
            <select value={animation.origin} onChange={(e) => updateAnimation({ origin: e.target.value as GrowOrigin })}>
              {ORIGIN_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </Field>
        </>
      )}

      {animation.kind === 'typewriter' && (
        <>
          <Field label={`Typing speed: ${animation.charIntervalMs}ms/char`}>
            <input
              type="range"
              min={10}
              max={200}
              value={animation.charIntervalMs}
              onChange={(e) => updateAnimation({ charIntervalMs: Number(e.target.value) })}
            />
          </Field>
          <Field label={`Speed jitter: ${animation.charIntervalJitter.toFixed(2)}`}>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={animation.charIntervalJitter}
              onChange={(e) => updateAnimation({ charIntervalJitter: Number(e.target.value) })}
            />
          </Field>
          <Field label={`Start delay: ${animation.startDelayMs}ms`}>
            <input
              type="range"
              min={0}
              max={2000}
              step={50}
              value={animation.startDelayMs}
              onChange={(e) => updateAnimation({ startDelayMs: Number(e.target.value) })}
            />
          </Field>
          <Field label={`Erase speed: ${animation.eraseIntervalMs}ms/char`}>
            <input
              type="range"
              min={5}
              max={100}
              value={animation.eraseIntervalMs}
              onChange={(e) => updateAnimation({ eraseIntervalMs: Number(e.target.value) })}
            />
          </Field>

          <Field label="Cursor">
            <input type="checkbox" checked={animation.cursor.enabled} onChange={(e) => updateCursor({ enabled: e.target.checked })} />
          </Field>

          {animation.cursor.enabled && (
            <>
              <Field label="Cursor style">
                <select value={animation.cursor.style} onChange={(e) => updateCursor({ style: e.target.value as CursorStyle })}>
                  {CURSOR_STYLE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Cursor color">
                <input type="color" value={animation.cursor.color} onChange={(e) => updateCursor({ color: e.target.value })} />
              </Field>
              <Field label={`Blink: ${animation.cursor.blinkMs === 0 ? 'solid' : `${animation.cursor.blinkMs}ms`}`}>
                <input
                  type="range"
                  min={0}
                  max={1600}
                  step={100}
                  value={animation.cursor.blinkMs}
                  onChange={(e) => updateCursor({ blinkMs: Number(e.target.value) })}
                />
              </Field>
              <Field label="Hide cursor once done (non-looping)">
                <input
                  type="checkbox"
                  checked={animation.cursor.hideOnComplete}
                  onChange={(e) => updateCursor({ hideOnComplete: e.target.checked })}
                />
              </Field>
            </>
          )}
        </>
      )}
    </div>
  );
}
