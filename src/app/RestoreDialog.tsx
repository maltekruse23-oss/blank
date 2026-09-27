import { useState, type FormEvent } from 'react';
import { DownloadCloud } from 'lucide-react';
import { motion } from 'motion/react';
import { spring } from '../design/motion';
import { cloud, parseCode } from '../adapters/cloud';
import { flushMirror } from '../platform/store';
import { applySettings, describeSettings } from '../features/settings/applySettings';
import { parseSettingsFile, type ImportedSettings } from '../features/settings/settingsFile';
import type { Preferences } from '../features/settings/preferences';
import type { Music } from '../features/music/useMusic';
import type { Apps } from '../features/apps/useApps';
import type { TwitchData } from '../features/twitch/useTwitch';

type Step =
  | { kind: 'enter'; error: string | null }
  | { kind: 'loading' }
  | { kind: 'check'; data: ImportedSettings }
  | { kind: 'applying' };

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

/**
 * Taking over an online backup with its move code: opens by itself on the first start of a fresh
 * installation, or from the Apps page. Shows what the backup contains and replaces the settings
 * only after "Übernehmen"; then the Apps page offers to install the programs.
 */
export function RestoreDialog({
  fresh,
  onClose,
  onDone,
  update,
  music,
  apps,
  twitch,
}: {
  /** First start on this PC: worded as a welcome. */
  fresh: boolean;
  onClose: () => void;
  onDone: () => void;
  update: (next: Preferences) => void;
  music: Music;
  apps: Apps;
  twitch: TwitchData;
}) {
  const [input, setInput] = useState('');
  const [step, setStep] = useState<Step>({ kind: 'enter', error: null });

  async function load(event: FormEvent) {
    event.preventDefault();
    const code = parseCode(input);
    if (!code || code === 'typo') {
      setStep({
        kind: 'enter',
        error: code
          ? 'Im Code ist ein Tippfehler – bitte Zeichen für Zeichen vergleichen.'
          : 'Der Code ist noch nicht vollständig.',
      });
      return;
    }
    if (!cloud) return;
    setStep({ kind: 'loading' });
    try {
      const data = parseSettingsFile(await cloud.restore(code));
      setStep(typeof data === 'string' ? { kind: 'enter', error: data } : { kind: 'check', data });
    } catch (error) {
      setStep({ kind: 'enter', error: message(error) });
    }
  }

  async function takeOver(data: ImportedSettings) {
    setStep({ kind: 'applying' });
    await applySettings(data, { update, music, apps, twitch });
    await flushMirror();
    onDone();
  }

  if (!cloud) return null;
  return (
    <motion.div
      className="restore-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="restore-title"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1, transition: { duration: 0.2 } }}
      exit={{ opacity: 0, transition: { duration: 0.16 } }}
    >
      {/* The card springs in from slightly below, a little small. */}
      <motion.div
        className="restore-card"
        initial={{ opacity: 0, y: 18, scale: 0.92 }}
        animate={{ opacity: 1, y: 0, scale: 1, transition: spring('bouncy') }}
        exit={{ opacity: 0, y: 8, scale: 0.96, transition: { duration: 0.14 } }}
      >
        <span className="page-icon">
          <DownloadCloud size={17} />
        </span>
        <h2 id="restore-title">{fresh ? 'Willkommen bei blank.' : 'Umzugs-Code eingeben'}</h2>
        {(step.kind === 'enter' || step.kind === 'loading') && (
          <form onSubmit={(event) => void load(event)}>
            <p>
              {fresh
                ? 'Hast du vor dem Zurücksetzen online gesichert? Dann gib hier deinen Umzugs-Code ein – alles kommt zurück.'
                : 'Der Code, den blank. beim Online-Sichern gezeigt hat.'}
            </p>
            <label className="search">
              <input
                autoFocus
                aria-label="Umzugs-Code"
                placeholder="z. B. 7F3K9-2QDXW-D9EAJ-DWRAG-4M"
                spellCheck={false}
                autoComplete="off"
                value={input}
                onChange={(e) => {
                  setInput(e.target.value);
                  if (step.kind === 'enter' && step.error) setStep({ kind: 'enter', error: null });
                }}
              />
            </label>
            {step.kind === 'enter' && step.error && (
              <p className="form-message" role="status">
                {step.error}
              </p>
            )}
            <div className="import-actions">
              <button
                className="filter-button selected"
                type="submit"
                disabled={!input.trim() || step.kind === 'loading'}
              >
                {step.kind === 'loading' ? 'Lädt …' : 'Laden'}
              </button>
              <button className="filter-button" type="button" onClick={onClose}>
                {fresh ? 'Ohne Code starten' : 'Abbrechen'}
              </button>
            </div>
          </form>
        )}
        {step.kind === 'check' && (
          <>
            <p>
              <b>{describeSettings(step.data)}</b>
            </p>
            <p className="restore-note">
              Ersetzt die aktuellen Einstellungen. Danach zeigt blank. deine Programme zum
              Installieren.
            </p>
            <div className="import-actions">
              <button
                className="filter-button selected"
                autoFocus
                onClick={() => void takeOver(step.data)}
              >
                Übernehmen
              </button>
              <button className="filter-button" onClick={onClose}>
                Abbrechen
              </button>
            </div>
          </>
        )}
        {step.kind === 'applying' && <p role="status">Übernimmt …</p>}
      </motion.div>
    </motion.div>
  );
}
