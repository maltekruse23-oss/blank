import { useEffect } from 'react';
import { Download, Package, Plus, RefreshCw, Square, X } from 'lucide-react';
import { Card } from '../../components/ui';
import type { AppOffer, AppPackage } from '../../adapters/apps';
import type { Page } from '../../app/App';
import type { Apps } from './useApps';
import { CloudCard } from './CloudCard';

/** Line under a chosen program: install progress, or whether it is on this PC. */
function status(apps: Apps, app: AppPackage) {
  const p = apps.progress[app.id];
  if (p?.state === 'downloading') return `Lädt vom Hersteller … ${p.detail ?? 0} %`;
  if (p?.state === 'verifying') return 'Prüft die Signatur …';
  if (p?.state === 'installing')
    return p.detail === 'window' ? 'Installer ist offen – bitte durchklicken' : 'Installiert …';
  if (p?.state === 'done') return p.detail ? `Installiert (${p.detail})` : 'Installiert';
  if (p?.state === 'skipped') return 'Abgebrochen';
  if (p?.state === 'failed') return `Nicht installiert: ${p.detail ?? 'Fehler'}`;
  if (apps.scan.status !== 'ready') return 'Prüft …';
  if (apps.installed(app.id)) return 'Auf diesem PC';
  return apps.silent(app.id)
    ? 'Fehlt auf diesem PC'
    : 'Fehlt auf diesem PC · Installer öffnet sein eigenes Fenster';
}

function OfferRow({ app, onAdd }: { app: AppOffer; onAdd: () => void }) {
  return (
    <div className="list-row">
      <span className="device-small">
        <Package size={18} strokeWidth={1.5} />
      </span>
      <div className="row-copy">
        <b>{app.name}</b>
        {!app.silent && <small>Installer mit eigenem Fenster</small>}
      </div>
      <button className="filter-button" aria-label={`${app.name} mitnehmen`} onClick={onAdd}>
        <Plus size={15} /> Mitnehmen
      </button>
    </div>
  );
}

/**
 * Reset helper: before a reset, choose the programs to take along (they travel in the settings
 * file); after it, install the missing ones with one click — straight from their makers, each
 * installer checked for the maker's digital signature.
 */
export function AppsPage({
  apps,
  navigate,
  content,
  onRestore,
}: {
  apps: Apps;
  navigate: (page: Page) => void;
  /** The web part of the settings file, for the online backup. */
  content: () => string;
  /** Opens the dialog for entering a move code. */
  onRestore: () => void;
}) {
  // Once per app start; the list keeps its state across pages.
  // eslint-disable-next-line react-hooks/exhaustive-deps -- see above
  useEffect(() => apps.scanOnce(), []);

  if (!apps.available)
    return (
      <div className="empty-state">
        <Package />
        <h2>Nur in der Desktop-App</h2>
      </div>
    );

  const { result, scan } = apps;
  const chosen = (id: string) => apps.selected.some((s) => s.id === id);
  const installedOffer = result?.installed.filter((a) => !chosen(a.id)) ?? [];
  const moreOffer = result?.available.filter((a) => !chosen(a.id)) ?? [];
  const finished = Object.values(apps.progress).filter((p) =>
    ['done', 'failed', 'skipped'].includes(p.state),
  ).length;
  return (
    <div className="apps-layout">
      <div className="toolbar">
        <span className="toolbar-count">
          <b>{apps.selected.length}</b> zum Mitnehmen
        </span>
        <button className="text-link" onClick={() => navigate('settings')}>
          Umzugs-Datei (Settings)
        </button>
        <button
          className={`filter-button icon-only ${scan.status === 'scanning' ? 'spinning' : ''}`}
          aria-label="Programme neu einlesen"
          title="Programme neu einlesen"
          disabled={scan.status === 'scanning' || apps.installing}
          onClick={() => void apps.refresh()}
        >
          <RefreshCw size={16} />
        </button>
      </div>
      {scan.status === 'error' && (
        <p className="form-message" role="status">
          {scan.message}
        </p>
      )}
      {(apps.missing.length > 0 || apps.installing) && (
        <Card title="Programme installieren">
          <div className="apps-install">
            {apps.installing ? (
              <button className="filter-button" onClick={apps.cancel}>
                <Square size={14} /> Nach diesem Programm aufhören
              </button>
            ) : (
              <button className="filter-button selected" onClick={() => void apps.installMissing()}>
                <Download size={15} />{' '}
                {apps.missing.length === 1
                  ? '1 Programm installieren'
                  : `${apps.missing.length} Programme installieren`}
              </button>
            )}
            <p role="status">
              {apps.installing
                ? `${finished} von ${Object.keys(apps.progress).length || apps.missing.length} fertig – blank. offen lassen. Fragt Windows nach Erlaubnis, auf „Ja“ klicken.`
                : 'Direkt vom Hersteller; gestartet wird nur, was dessen gültige Signatur trägt. Mit dem Klick nimmst du die Lizenzbedingungen der Programme an.'}
            </p>
          </div>
          {apps.installError && (
            <p className="form-message" role="status">
              {apps.installError}
            </p>
          )}
        </Card>
      )}
      <CloudCard
        content={content}
        count={apps.selected.length}
        installed={result?.installed.length ?? 0}
        onTakeAll={() => result && apps.addAll(result.installed)}
        onRestore={onRestore}
      />
      <Card title="Mitnehmen">
        {apps.selected.length === 0 && (
          <p className="form-message">Noch nichts ausgewählt – unten Programme hinzufügen.</p>
        )}
        {apps.selected.map((app) => (
          <div className="list-row" key={app.id}>
            <span className="device-small">
              <Package size={18} strokeWidth={1.5} />
            </span>
            <div className="row-copy">
              <b>{app.name}</b>
              <small role="status">{status(apps, app)}</small>
            </div>
            <button
              className="icon-button"
              aria-label={`${app.name} nicht mitnehmen`}
              title="Nicht mitnehmen"
              disabled={apps.installing}
              onClick={() => apps.remove(app.id)}
            >
              <X size={15} />
            </button>
          </div>
        ))}
        {apps.saveFailed && (
          <p className="form-message" role="status">
            Speichern nicht verfügbar.
          </p>
        )}
      </Card>
      <Card title="Auf diesem PC">
        {scan.status === 'scanning' && <p className="form-message">Liest die Programme …</p>}
        {result && installedOffer.length === 0 && (
          <p className="form-message">Alles Installierte aus der Liste ist schon ausgewählt.</p>
        )}
        {installedOffer.length > 1 && (
          <button className="text-link apps-all" onClick={() => apps.addAll(installedOffer)}>
            Alle {installedOffer.length} mitnehmen
          </button>
        )}
        {installedOffer.map((app) => (
          <OfferRow key={app.id} app={app} onAdd={() => apps.add(app)} />
        ))}
      </Card>
      {moreOffer.length > 0 && (
        <Card title="Weitere Programme">
          {moreOffer.map((app) => (
            <OfferRow key={app.id} app={app} onAdd={() => apps.add(app)} />
          ))}
        </Card>
      )}
      {result && result.manual.length > 0 && (
        <Card title="Nur von Hand">
          <p className="section-note">
            Nicht in blank.s Liste. Spiele kommen über ihren Launcher zurück (Steam, Riot …),
            Store-Apps über den Microsoft Store.
          </p>
          <div className="offline-list">
            {result.manual.map((name) => (
              <span className="offline-chip" key={name}>
                {name}
              </span>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
