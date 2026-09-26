import { useRef, useState, type ChangeEvent } from 'react';
import { Download, Upload } from 'lucide-react';
import { Card } from '../../components/ui';
import { saveSettingsFile } from '../../platform/system';
import type { Music } from '../music/useMusic';
import type { Apps } from '../apps/useApps';
import type { TwitchData } from '../twitch/useTwitch';
import type { Preferences } from './preferences';
import { parseSettingsFile, settingsFileContent, type ImportedSettings } from './settingsFile';
import { applySettings, describeSettings } from './applySettings';

type Step =
  | { kind: 'idle' }
  | { kind: 'busy' }
  | { kind: 'check'; data: ImportedSettings }
  | { kind: 'message'; text: string };

/**
 * Moves all settings to another PC: export writes one file, import checks a file, shows its
 * contents and replaces the current settings only after confirming. The Twitch login and
 * autostart are never part of it.
 */
export function TransferCard({
  preferences,
  update,
  music,
  apps,
  twitch,
}: {
  preferences: Preferences;
  update: (next: Preferences) => void;
  music: Music;
  apps: Apps;
  twitch: TwitchData;
}) {
  const [exporting, setExporting] = useState<Step>({ kind: 'idle' });
  const [importing, setImporting] = useState<Step>({ kind: 'idle' });
  const picker = useRef<HTMLInputElement>(null);

  async function exportNow() {
    setExporting({ kind: 'busy' });
    try {
      const content = settingsFileContent(
        preferences,
        { accounts: music.accounts, volume: music.volume },
        apps.selected,
      );
      const name = await saveSettingsFile(content);
      setExporting({ kind: 'message', text: `Gespeichert in Downloads: ${name}` });
    } catch (error) {
      setExporting({
        kind: 'message',
        text: typeof error === 'string' ? error : 'Export fehlgeschlagen.',
      });
    }
  }

  async function read(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setImporting({ kind: 'busy' });
    const text = file.size > 512 * 1024 ? '' : await file.text().catch(() => '');
    const data = text ? parseSettingsFile(text) : 'Datei nicht lesbar oder zu groß.';
    setImporting(
      typeof data === 'string' ? { kind: 'message', text: data } : { kind: 'check', data },
    );
  }

  async function apply(data: ImportedSettings) {
    setImporting({ kind: 'busy' });
    const twitchNote = await applySettings(data, { update, music, apps, twitch });
    setImporting({
      kind: 'message',
      text: `Übernommen.${twitchNote} Twitch-Login und Autostart gehören nicht dazu.${data.apps?.length ? ' Programme installieren: Seite Apps.' : ''}`,
    });
  }

  const pending = importing.kind === 'check' ? importing.data : null;
  const date = pending?.exportedAt ? new Date(pending.exportedAt) : null;
  return (
    <Card title="Übertragen">
      <div className="setting-row">
        <div>
          <h3>Exportieren</h3>
          <p role="status">
            {exporting.kind === 'message' ? exporting.text : 'Alle Einstellungen als Datei'}
          </p>
        </div>
        <button
          className="filter-button"
          disabled={exporting.kind === 'busy'}
          onClick={() => void exportNow()}
        >
          <Download size={15} /> Exportieren
        </button>
      </div>
      <div className="setting-row">
        <div>
          <h3>Importieren</h3>
          <p role="status">
            {importing.kind === 'message'
              ? importing.text
              : importing.kind === 'busy'
                ? 'Liest …'
                : 'Übernimmt alles aus einer exportierten Datei'}
          </p>
        </div>
        <button
          className="filter-button"
          disabled={importing.kind === 'busy'}
          onClick={() => picker.current?.click()}
        >
          <Upload size={15} /> Datei wählen
        </button>
        <input
          ref={picker}
          type="file"
          accept=".json,application/json"
          hidden
          aria-label="Einstellungsdatei wählen"
          onChange={(event) => void read(event)}
        />
      </div>
      {pending && (
        <div className="import-check" role="group" aria-label="Import prüfen">
          <p>
            <b>{describeSettings(pending)}</b>
            {date && !Number.isNaN(date.getTime()) && (
              <> · exportiert am {date.toLocaleDateString('de-DE')}</>
            )}
          </p>
          <p>Ersetzt die aktuellen Einstellungen.</p>
          <div className="import-actions">
            <button className="filter-button selected" onClick={() => void apply(pending)}>
              Übernehmen
            </button>
            <button className="filter-button" onClick={() => setImporting({ kind: 'idle' })}>
              Abbrechen
            </button>
          </div>
        </div>
      )}
    </Card>
  );
}
