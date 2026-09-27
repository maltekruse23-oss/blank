import { useState, type FormEvent } from 'react';
import { Copy, LogOut, MonitorPlay, RefreshCw, RotateCcw, Users, X } from 'lucide-react';
import { channelFromInput, parseRoomCode } from '../../adapters/watch';
import { Badge, Card } from '../../components/ui';
import type { TwitchData } from './useTwitch';
import type { WatchData } from './useWatch';

/** Watch together (useWatch): start or join a room; in the room, switch and open the player. */
export function WatchPanel({
  watch,
  twitch,
  name,
}: {
  watch: WatchData;
  twitch: TwitchData;
  /** Stored name or, if none, the Twitch name. */
  name: string;
}) {
  return (
    <div id="watch" className="watchlist">
      <Card title="Zusammen schauen">
        {watch.room ? (
          <InRoom watch={watch} twitch={twitch} />
        ) : (
          <Lobby watch={watch} name={name} />
        )}
      </Card>
    </div>
  );
}

function Lobby({ watch, name: stored }: { watch: WatchData; name: string }) {
  const [name, setName] = useState(stored);
  const [code, setCode] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const who = name.trim();

  function join(event: FormEvent) {
    event.preventDefault();
    const parsed = parseRoomCode(code);
    if (parsed === null) setMessage('Der Code ist noch nicht vollständig.');
    else if (parsed === 'typo') setMessage('Im Code ist ein Tippfehler.');
    else watch.join(code, who);
  }

  return (
    <>
      <div className="watchlist-add">
        <label className="search">
          <input
            aria-label="Dein Name im Raum"
            placeholder="Dein Name"
            maxLength={24}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <button
          className="filter-button"
          disabled={!who || watch.busy}
          onClick={() => void watch.create(who)}
        >
          <Users size={16} /> Raum starten
        </button>
      </div>
      <form className="watchlist-add watch-join" onSubmit={join}>
        <label className="search">
          <input
            aria-label="Raum-Code"
            placeholder="Raum-Code, z. B. 7F3K-9QDX-WDM4"
            autoComplete="off"
            spellCheck={false}
            value={code}
            onChange={(e) => {
              setCode(e.target.value);
              setMessage(null);
            }}
          />
        </label>
        <button
          className="filter-button"
          type="submit"
          disabled={!who || !code.trim() || watch.busy}
        >
          Beitreten
        </button>
      </form>
      {watch.lastRoom && (
        <div className="watch-last">
          <div className="row-copy">
            <b>Letzter Raum</b>
            <small>{watch.lastRoom}</small>
          </div>
          <button
            className="filter-button"
            disabled={!who || watch.busy}
            onClick={() => watch.join(watch.lastRoom!, who)}
          >
            <RotateCcw size={15} /> Wieder beitreten
          </button>
        </div>
      )}
      {(message ?? watch.error) && (
        <p className="form-message" role="status">
          {message ?? watch.error}
        </p>
      )}
      {!who && (
        <p className="form-message" role="status">
          Erst einen Namen eingeben – den sehen die anderen im Raum.
        </p>
      )}
    </>
  );
}

function InRoom({ watch, twitch }: { watch: WatchData; twitch: TwitchData }) {
  const [input, setInput] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const room = watch.room!;
  const { channel } = watch;

  async function switchTo(event: FormEvent) {
    event.preventDefault();
    const login = channelFromInput(input);
    if (!login) {
      setMessage('Das ist kein Twitch-Kanal.');
      return;
    }
    // With Twitch connected, the channel is checked and gets its proper name.
    let display = login;
    if (twitch.adapter.source === 'twitch') {
      const found = await twitch.adapter.findChannel(login).catch(() => undefined);
      if (found === null) {
        setMessage(`Kanal „${login}“ nicht gefunden.`);
        return;
      }
      if (found) display = found.displayName;
    }
    watch.switchTo(login, display);
    setInput('');
    setMessage(null);
  }

  function copy() {
    void navigator.clipboard.writeText(room.code).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <>
      <div className="watch-room-head">
        <span className="room-code" aria-label={`Raum-Code ${room.code}`}>
          {room.code}
        </span>
        <button className="filter-button" onClick={copy}>
          <Copy size={15} /> {copied ? 'Kopiert' : 'Kopieren'}
        </button>
        {watch.connected ? (
          <Badge active>{watch.linked === 2 ? 'Verbunden' : 'Verbunden (1 von 2)'}</Badge>
        ) : (
          <Badge>Verbindet …</Badge>
        )}
        <button className="filter-button watch-leave" onClick={() => void watch.leave()}>
          <LogOut size={15} /> Verlassen
        </button>
      </div>
      <div className="watch-members" aria-label="Im Raum">
        <span className="chip">Du</span>
        {watch.members.map((m) => (
          <span className="chip" key={m.id}>
            {m.name}
          </span>
        ))}
        {watch.members.length === 0 && (
          <small>Noch allein – schick den Code an deine Freunde.</small>
        )}
      </div>
      <div className="watch-now">
        <div className="row-copy">
          <b>{channel ? channel.display : 'Noch kein Kanal'}</b>
          <small>
            {channel
              ? `umgeschaltet von ${channel.id === watch.me ? 'dir' : channel.by}`
              : 'Klick auf einen Live-Kanal oder gib einen ein.'}
          </small>
        </div>
        {channel && (
          <>
            {watch.playerOpen ? (
              <button className="filter-button" onClick={watch.closePlayer}>
                <X size={15} /> Player schließen
              </button>
            ) : (
              <button className="filter-button" onClick={() => watch.openPlayer()}>
                <MonitorPlay size={15} /> Player öffnen
              </button>
            )}
            <button
              className="filter-button"
              title="Alle starten den Stream neu und sind wieder gleich weit"
              onClick={watch.resync}
            >
              <RefreshCw size={15} /> Neu synchronisieren
            </button>
          </>
        )}
      </div>
      <form className="watchlist-add" onSubmit={(e) => void switchTo(e)}>
        <label className="search">
          <input
            aria-label="Kanal für alle"
            placeholder="Kanal für alle, z. B. xqc"
            autoComplete="off"
            spellCheck={false}
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              setMessage(null);
            }}
          />
        </label>
        <button className="filter-button" type="submit" disabled={!input.trim()}>
          Umschalten
        </button>
      </form>
      {(message ?? watch.error ?? watch.event) && (
        <p className="form-message" role="status">
          {message ?? watch.error ?? watch.event}
        </p>
      )}
    </>
  );
}
