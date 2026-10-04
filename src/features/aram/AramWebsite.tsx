import { useEffect, useState } from 'react';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

type WebsiteStatus = {
  enabled: boolean;
  uploading: boolean;
  uploaded: number;
  pending: number;
  archiveUploaded: number;
  archivePending: number;
  lastSuccess: number | null;
  error: string | null;
};

/** Native upload status; the preview never connects or uploads mock games. */
export function AramWebsite() {
  const [status, setStatus] = useState<WebsiteStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!isTauri()) return;
    let active = true;
    const stop = listen<WebsiteStatus>('aram-website', ({ payload }) => {
      if (active) setStatus(payload);
    });
    void invoke<WebsiteStatus>('aram_website', { enabled: null }).then(
      (value) => active && setStatus(value),
      () => active && setError('Website-Uploadstatus nicht verfügbar.'),
    );
    return () => {
      active = false;
      void stop.then((unlisten) => unlisten());
    };
  }, []);

  if (!isTauri()) return null;
  const change = async () => {
    if (!status) return;
    try {
      setError(null);
      setStatus(await invoke<WebsiteStatus>('aram_website', { enabled: !status.enabled }));
    } catch {
      setError('Website-Upload konnte nicht umgestellt werden.');
    }
  };
  // Off by default; nothing leaves the PC before this click (friends get the same app).
  if (status && !status.enabled) {
    return (
      <p className="aram-note" role="status">
        Website-Upload aus. Erlaubst du ihn, gehen deine gespeicherten Mayhem-Spiele (auch die
        deiner Freunde, mit Riot-ID) und die vollständigen Spieldaten aller zehn Spieler an die
        Mayhem-Website; dort sind sie öffentlich zu sehen. Jederzeit pausierbar.{' '}
        <button className="text-link" onClick={() => void change()}>
          Hochladen erlauben
        </button>
        {error && <> · {error}</>}
      </p>
    );
  }
  return (
    <p className="aram-note" role="status">
      Website:{' '}
      {status
        ? !status.enabled
          ? 'Upload pausiert'
          : status.uploading
            ? `lädt hoch · ${status.pending} offen`
            : `${status.uploaded} Spielereinträge bestätigt`
        : 'lädt …'}
      {' · '}
      {status && (
        <>
          {status.archiveUploaded} Matches archiviert · {status.archivePending} Archiv-Uploads offen
          {' · '}
        </>
      )}
      <button
        className="text-link"
        onClick={() =>
          void invoke('aram_website', { enabled: null, open: true }).catch(() =>
            setError('Website konnte nicht geöffnet werden.'),
          )
        }
      >
        Ansehen
      </button>
      {status && (
        <>
          {' '}
          ·{' '}
          <button className="text-link" onClick={() => void change()}>
            {status.enabled ? 'Pausieren' : 'Automatisch hochladen'}
          </button>
        </>
      )}
      {(error || status?.error) && <> · {error || status?.error}</>}
    </p>
  );
}
