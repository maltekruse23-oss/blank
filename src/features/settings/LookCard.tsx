import { useState, type CSSProperties, type FormEvent } from 'react';
import { Plus, RotateCcw, X } from 'lucide-react';
import {
  builtInPresets,
  changedCount,
  changeSettings,
  choosePreset,
  deletePreset,
  registry,
  resetSettings,
  resolveSettings,
  savePreset,
  type Customization,
  type DesignSettings,
  type SettingKey,
} from '../../design/customization';
import { useMotion } from '../../design/useDesign';
import { themes } from './themes';
import { defaultPreferences, withDesign, type Preferences } from './preferences';

/** Own accent colours (no brand colours); none chosen: the colour scheme's accent. */
const accents = [
  { color: '#7fd6b0', name: 'Minze' },
  { color: '#7cb8f5', name: 'Himmel' },
  { color: '#a98cf5', name: 'Violett' },
  { color: '#f58cb4', name: 'Rosa' },
  { color: '#f5907c', name: 'Koralle' },
  { color: '#e8c46a', name: 'Gold' },
  { color: '#c4e36a', name: 'Limette' },
  { color: '#e6e6e6', name: 'Weiß' },
] as const;

const factor = (value: number) =>
  `${value.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 2 })}×`;

/** The parts of the look, each a popover of the edit dock (features/edit/EditDock.tsx). */
export type LookPart = 'style' | 'color' | 'layout' | 'motion';

/**
 * The look: style (presets), colours, layout and motion of the design system, one part at a time
 * in the edit mode's dock. Every change is saved at once and seen at once: the app itself is the
 * preview (tokens on <html>). Animations only on or off (user's wish). Only settings that already
 * do something are shown.
 */
export function LookCard({
  part,
  preferences,
  update,
  storageAvailable,
  replayStart,
  restartForGpu,
}: {
  part: LookPart;
  preferences: Preferences;
  update: (next: Preferences) => void;
  storageAvailable: boolean;
  replayStart: () => void;
  /** Set when the graphics card choice changed and needs a restart (gpu.rs). */
  restartForGpu?: () => void;
}) {
  const c = preferences.customization;
  const { settings, source } = resolveSettings(c);
  const motion = useMotion();
  const [name, setName] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const design = (change: (c: Customization) => Customization) =>
    update(withDesign(preferences, change));
  const set = (patch: Partial<DesignSettings>) => design((x) => changeSettings(x, patch));

  /** Back to the style's value; only where the user changed something. */
  const undo = (key: SettingKey) =>
    source[key] === 'user' && (
      <button
        className="setting-undo"
        aria-label={`${registry[key].label} zurücksetzen`}
        title="Zurücksetzen"
        onClick={() => design((x) => resetSettings(x, [key]))}
      >
        <RotateCcw size={13} />
      </button>
    );

  const own = c.presets.find((p) => `user:${p.id}` === c.preset);
  const builtIn = builtInPresets.find((p) => p.id === c.preset);
  const changed = changedCount(c);

  function save(event: FormEvent) {
    event.preventDefault();
    const next = savePreset(c, name ?? '');
    if (!next) {
      setNote(
        c.presets.length >= 20 ? 'Höchstens 20 eigene Stile.' : 'Bitte einen Namen eingeben.',
      );
      return;
    }
    update(withDesign(preferences, () => next));
    setName(null);
    setNote(null);
  }

  const accentName = settings.accent
    ? (accents.find((a) => a.color === settings.accent)?.name ?? settings.accent)
    : 'Wie das Farbschema';
  const customAccent =
    settings.accent !== null && !accents.some((a) => a.color === settings.accent);

  return (
    <div className="look-part">
      {part === 'style' && (
        <>
          <div className="setting-row setting-row-wide">
            <div>
              <h3>Stil</h3>
              <p>
                {own ? 'Eigener Stil' : builtIn?.description}
                {changed > 0 && ` · ${changed} eigene ${changed === 1 ? 'Änderung' : 'Änderungen'}`}
              </p>
            </div>
            <div className="segment-picker" role="group" aria-label="Stil">
              {builtInPresets.map((p) => (
                <button
                  key={p.id}
                  className={`filter-button ${c.preset === p.id ? 'selected' : ''}`}
                  aria-pressed={c.preset === p.id}
                  title={p.description}
                  onClick={() => design((x) => choosePreset(x, p.id))}
                >
                  {p.name}
                </button>
              ))}
              {c.presets.map((p) => (
                <span key={p.id} className="preset-own">
                  <button
                    className={`filter-button ${c.preset === `user:${p.id}` ? 'selected' : ''}`}
                    aria-pressed={c.preset === `user:${p.id}`}
                    onClick={() => design((x) => choosePreset(x, `user:${p.id}`))}
                  >
                    {p.name}
                  </button>
                  <button
                    className="filter-button"
                    aria-label={`Stil „${p.name}“ löschen`}
                    title="Löschen"
                    onClick={() => design((x) => deletePreset(x, p.id))}
                  >
                    <X size={13} />
                  </button>
                </span>
              ))}
              {name === null && (
                <button
                  className="filter-button preset-add"
                  title="Aktuelles Aussehen als eigenen Stil speichern"
                  onClick={() => setName('')}
                >
                  <Plus size={13} />
                  Speichern
                </button>
              )}
            </div>
          </div>
          {name !== null && (
            <form className="setting-row preset-save reveal" onSubmit={save}>
              <div>
                <h3>Als eigenen Stil speichern</h3>
                {note && <p role="status">{note}</p>}
              </div>
              <label className="search setting-input">
                <input
                  aria-label="Name des Stils"
                  placeholder="Name"
                  maxLength={40}
                  value={name}
                  autoFocus
                  onChange={(event) => setName(event.target.value)}
                  onKeyDown={(event) => event.key === 'Escape' && setName(null)}
                />
              </label>
              <button className="filter-button" type="submit">
                Speichern
              </button>
              <button
                className="text-link"
                type="button"
                onClick={() => {
                  setName(null);
                  setNote(null);
                }}
              >
                Abbrechen
              </button>
            </form>
          )}
          <div className="look-reset">
            <button
              className="secondary-button"
              onClick={() =>
                // Only the look (own styles stay); notifications, popouts and system settings stay too.
                update({
                  ...withDesign(preferences, (x) => ({
                    ...resetSettings(x, 'all'),
                    preset: 'default',
                  })),
                  theme: defaultPreferences.theme,
                })
              }
            >
              Darstellung zurücksetzen
            </button>
          </div>
        </>
      )}
      {part === 'color' && (
        <>
          <div className="setting-row">
            <div>
              <h3>Farbschema</h3>
              <p>{themes.find((t) => t.id === preferences.theme)?.name}</p>
            </div>
            <div className="theme-picker" role="group" aria-label="Farbschema">
              {themes.map((t) => (
                <button
                  key={t.id}
                  className="theme-swatch"
                  data-theme={t.id}
                  aria-label={t.name}
                  aria-pressed={preferences.theme === t.id}
                  title={t.name}
                  onClick={() => update({ ...preferences, theme: t.id })}
                />
              ))}
            </div>
          </div>
          <div className="setting-row">
            <div>
              <h3>Akzentfarbe</h3>
              <p>{accentName}</p>
            </div>
            {undo('accent')}
            <div className="theme-picker" role="group" aria-label="Akzentfarbe">
              <button
                className="theme-swatch"
                data-theme={preferences.theme}
                aria-label="Wie das Farbschema"
                aria-pressed={settings.accent === null}
                title="Wie das Farbschema"
                onClick={() => set({ accent: null })}
              />
              {accents.map((a) => (
                <button
                  key={a.color}
                  className="theme-swatch accent-swatch"
                  style={{ '--swatch': a.color } as CSSProperties}
                  aria-label={a.name}
                  aria-pressed={settings.accent === a.color}
                  title={a.name}
                  onClick={() => set({ accent: a.color })}
                />
              ))}
              <label
                className="theme-swatch accent-custom"
                data-on={customAccent}
                title="Eigene Farbe"
                style={
                  customAccent ? ({ '--swatch': settings.accent } as CSSProperties) : undefined
                }
              >
                {!customAccent && <Plus size={12} />}
                <input
                  type="color"
                  aria-label="Eigene Akzentfarbe"
                  value={settings.accent ?? '#afd58c'}
                  onChange={(event) => set({ accent: event.target.value })}
                />
              </label>
            </div>
          </div>
        </>
      )}
      {part === 'layout' && (
        <>
          <div className="setting-row">
            <div>
              <h3>Dichte</h3>
              <p>Abstände in Karten und Listen</p>
            </div>
            {undo('density')}
            <div className="segment-picker" role="group" aria-label="Dichte">
              {registry.density.type === 'enum' &&
                registry.density.options.map((o) => (
                  <button
                    key={o.id}
                    className={`filter-button ${settings.density === o.id ? 'selected' : ''}`}
                    aria-pressed={settings.density === o.id}
                    onClick={() => set({ density: o.id as DesignSettings['density'] })}
                  >
                    {o.name}
                  </button>
                ))}
            </div>
          </div>
          <div className="setting-row">
            <div>
              <h3>Rundung</h3>
              <p>0 eckig, 1 wie gewohnt, 2 doppelt so rund</p>
            </div>
            {undo('radiusScale')}
            <input
              type="range"
              className="volume-slider"
              min={0}
              max={2}
              step={0.05}
              value={settings.radiusScale}
              aria-label="Rundung"
              aria-valuetext={factor(settings.radiusScale)}
              style={{ '--value': `${(settings.radiusScale / 2) * 100}%` } as CSSProperties}
              onChange={(event) => set({ radiusScale: Number(event.target.value) })}
            />
            <span className="volume-value" aria-hidden>
              {factor(settings.radiusScale)}
            </span>
          </div>
        </>
      )}
      {part === 'motion' && (
        <>
          <div className="setting-row">
            <div>
              <h3>Animationen</h3>
              <p>Seitenwechsel, Aufklappen, Startbildschirm</p>
            </div>
            <button
              className="switch"
              role="switch"
              aria-checked={settings.motionLevel !== 'off'}
              aria-label="Animationen"
              onClick={() =>
                set({ motionLevel: settings.motionLevel === 'off' ? 'normal' : 'off' })
              }
            >
              <span />
            </button>
          </div>
          {restartForGpu && (
            <div className="setting-row" role="status">
              <div>
                <h3>Grafikkarte</h3>
                <p>
                  {settings.motionLevel === 'off'
                    ? 'Wird beim nächsten Start ausgeschaltet (spart Leistung)'
                    : 'Wird beim nächsten Start eingeschaltet (flüssige Animationen)'}
                </p>
              </div>
              <button className="filter-button" onClick={restartForGpu}>
                Jetzt neu starten
              </button>
            </div>
          )}
          <div className="setting-row">
            <div>
              <h3>Startbildschirm</h3>
              <p>Beim Start von blank.; Klick oder Taste überspringt ihn</p>
            </div>
            <button className="text-link" disabled={!motion.enabled} onClick={replayStart}>
              Ansehen
            </button>
            <button
              className="switch"
              role="switch"
              aria-checked={preferences.startScreen}
              aria-label="Startbildschirm"
              disabled={!motion.enabled}
              onClick={() => update({ ...preferences, startScreen: !preferences.startScreen })}
            >
              <span />
            </button>
          </div>
        </>
      )}
      {!storageAvailable && <p role="status">Speichern nicht verfügbar.</p>}
    </div>
  );
}
