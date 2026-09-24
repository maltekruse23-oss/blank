import { useState, type FormEvent } from 'react';
import { errorKind, type DeviceLogin, type TwitchAccountApi } from '../../adapters/twitch';
import { Badge, Card } from '../../components/ui';
import type { TwitchData } from './useTwitch';

// Twitch client IDs are ~30 character codes; shorter input is usually a channel name.
const clientIdPattern = /^[a-z0-9]{20,64}$/i;
const notAClientId =
  'Das ist keine Client-ID, sondern z. B. ein Kanalname. Kanäle fügst du nach dem Verbinden unter „Kanäle“ hinzu.';

function isInvalidClient(error: unknown) {
  return error instanceof Error && error.message === 'invalid client';
}

function messageFor(error: unknown) {
  switch (errorKind(error)) {
    case 'login-cancelled':
      return null;
    case 'login-expired':
      return 'Code abgelaufen. Bitte erneut verbinden.';
    case 'offline':
      return 'Keine Verbindung zu Twitch.';
    case 'rate-limited':
      return 'Zu viele Anfragen. Bitte kurz warten.';
    default:
      if (isInvalidClient(error)) return 'Twitch kennt diese Client-ID nicht.';
      return error instanceof Error ? error.message : 'Unbekannter Fehler.';
  }
}

export function TwitchAccountCard({ twitch }: { twitch: TwitchData }) {
  const api = twitch.adapter.account;
  return api ? <AccountCard api={api} twitch={twitch} /> : null;
}

function AccountCard({ api, twitch }: { api: TwitchAccountApi; twitch: TwitchData }) {
  const { account } = twitch;
  const [clientId, setClientId] = useState('');
  const [device, setDevice] = useState<DeviceLogin | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [editingClientId, setEditingClientId] = useState(false);
  const showClientIdForm = account !== null && (!account.configured || editingClientId);

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setMessage(null);
    try {
      await action();
      twitch.refresh();
    } catch (error) {
      setMessage(messageFor(error));
      if (isInvalidClient(error)) setEditingClientId(true);
    } finally {
      setBusy(false);
    }
  }

  function saveClientId(event: FormEvent) {
    event.preventDefault();
    if (!clientIdPattern.test(clientId.trim())) {
      setMessage(notAClientId);
      return;
    }
    void run(async () => {
      await api.setClientId(clientId.trim());
      setEditingClientId(false);
      setClientId('');
    });
  }

  function connect() {
    void run(async () => {
      try {
        setDevice(await api.startLogin());
        await api.finishLogin();
      } finally {
        setDevice(null);
      }
    });
  }

  return (
    <Card title="Twitch">
      {twitch.accountFailed && !account && <p role="status">Status nicht verfügbar.</p>}
      {!account && !twitch.accountFailed && <p role="status">Lädt …</p>}
      {showClientIdForm && (
        <>
          <ol className="setup-steps">
            <li>
              Auf <b>dev.twitch.tv/console/apps</b> eine Anwendung registrieren: Redirect-URL{' '}
              <b>http://localhost</b>, Client-Typ <b>Öffentlich</b>.
            </li>
            <li>Die dort angezeigte Client-ID (ca. 30 Zeichen) hier eintragen.</li>
          </ol>
          <form className="watchlist-add" onSubmit={saveClientId}>
            <label className="search">
              <input
                aria-label="Twitch Client-ID"
                placeholder="Client-ID"
                value={clientId}
                onChange={(e) => {
                  setClientId(e.target.value);
                  setMessage(null);
                }}
              />
            </label>
            <button className="filter-button" type="submit" disabled={busy || !clientId.trim()}>
              Speichern
            </button>
          </form>
        </>
      )}
      {account?.configured && device && (
        <div className="device-login" role="status">
          <strong className="device-code">{device.userCode}</strong>
          <small>Im Browser bestätigen · {device.verificationUri.split('?')[0]}</small>
          <button className="secondary-button" onClick={() => void api.cancelLogin()}>
            Abbrechen
          </button>
        </div>
      )}
      {account?.configured && !showClientIdForm && !device && !account.signedIn && (
        <div className="setting-row">
          <div>
            <h3>Nicht verbunden</h3>
          </div>
          <button className="text-link" disabled={busy} onClick={() => setEditingClientId(true)}>
            Client-ID ändern
          </button>
          <button className="filter-button" disabled={busy} onClick={connect}>
            Mit Twitch verbinden
          </button>
        </div>
      )}
      {account?.signedIn && !device && (
        <div className="setting-row">
          <div>
            <h3>{account.login || 'Verbunden'}</h3>
          </div>
          <Badge active>Verbunden</Badge>
          <button
            className="filter-button"
            disabled={busy}
            onClick={() => void run(() => api.logout())}
          >
            Trennen
          </button>
        </div>
      )}
      {message && (
        <p className="form-message" role="status">
          {message}
        </p>
      )}
    </Card>
  );
}
