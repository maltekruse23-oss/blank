import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from 'react';
import { Pause, Play, Plus, Shuffle, SkipForward, Square, Trash2 } from 'lucide-react';
import { isPlaylist, openSoundCloud } from '../../adapters/soundcloud';
import { Card, ChannelAvatar } from '../../components/ui';
import type { Music, Track } from './useMusic';

function clock(ms: number) {
  const total = Math.floor(ms / 1000);
  const [h, m, s] = [Math.floor(total / 3600), Math.floor(total / 60) % 60, total % 60];
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/** Position of the running track, read once per second only while it plays and is visible. */
function Progress({ music, track, playing }: { music: Music; track: Track; playing: boolean }) {
  const [position, setPosition] = useState(0);
  // The app re-renders often (usage, Twitch); the timer must not restart each time.
  const read = useRef(music.position);
  read.current = music.position;
  useEffect(() => {
    if (!playing) return;
    const tick = () => {
      if (!document.hidden) void read.current().then((ms) => ms !== undefined && setPosition(ms));
    };
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [playing]);
  const duration = track.durationMs;
  if (!duration) return null;
  const percent = Math.min(100, (position / duration) * 100);
  return (
    <div className="music-progress">
      <span>{clock(position)}</span>
      <input
        type="range"
        className="volume-slider"
        min={0}
        max={duration}
        step={1000}
        value={Math.min(position, duration)}
        aria-label="Position im Track"
        aria-valuetext={`${clock(position)} von ${clock(duration)}`}
        style={{ '--value': `${percent}%` } as CSSProperties}
        onChange={(event) => {
          const ms = Number(event.target.value);
          setPosition(ms);
          music.seek(ms);
        }}
      />
      <span>{clock(duration)}</span>
    </div>
  );
}

function NowPlaying({ music }: { music: Music }) {
  const { player } = music;
  if (player.status === 'idle')
    return (
      <Card title="Mix">
        <p className="music-status">Kein Mix aktiv</p>
      </Card>
    );
  if (player.status === 'loading')
    return (
      <Card title="Mix">
        <div className="now-playing">
          <p className="music-status" role="status">
            Mix von {player.account.name} lädt …
          </p>
          <button className="icon-button" aria-label="Stopp" title="Stopp" onClick={music.stop}>
            <Square size={15} />
          </button>
        </div>
      </Card>
    );
  if (player.status === 'error')
    return (
      <Card title="Mix">
        <div className="now-playing">
          <p className="music-status" role="status">
            {player.account.name}: {player.message}
          </p>
          <button className="filter-button" onClick={() => music.startMix(player.account)}>
            <Shuffle size={15} /> Nochmal
          </button>
        </div>
      </Card>
    );
  const { track, account } = player;
  const playing = player.status === 'playing';
  return (
    <Card title="Mix">
      <div className="now-playing">
        <ChannelAvatar
          login={account.permalink}
          imageUrl={track?.artworkUrl ?? account.avatarUrl}
        />
        <div className="row-copy">
          {track?.url ? (
            <button
              className="music-link"
              title="Auf SoundCloud öffnen"
              onClick={() => openSoundCloud(track.url!)}
            >
              <b>{track.title}</b>
            </button>
          ) : (
            <b>{track?.title ?? account.name}</b>
          )}
          <small>
            <button
              className="music-link"
              title="Profil auf SoundCloud öffnen"
              onClick={() => openSoundCloud(track?.artistUrl ?? account.url)}
            >
              {track?.artist || account.name}
            </button>{' '}
            · SoundCloud
          </small>
        </div>
        <div className="music-controls">
          <button
            className="icon-button"
            aria-label={playing ? 'Pause' : 'Abspielen'}
            title={playing ? 'Pause' : 'Abspielen'}
            onClick={music.toggle}
          >
            {playing ? <Pause size={15} /> : <Play size={15} />}
          </button>
          <button
            className="icon-button"
            aria-label="Nächster Track (zufällig)"
            title="Nächster Track (zufällig)"
            onClick={music.next}
          >
            <SkipForward size={15} />
          </button>
          <button className="icon-button" aria-label="Stopp" title="Stopp" onClick={music.stop}>
            <Square size={15} />
          </button>
        </div>
      </div>
      {track && (
        <Progress key={track.url ?? track.title} music={music} track={track} playing={playing} />
      )}
      <div className="music-volume">
        <span>Lautstärke</span>
        <input
          type="range"
          className="volume-slider"
          min={0}
          max={100}
          step={5}
          value={music.volume}
          aria-label="Lautstärke der Musik"
          aria-valuetext={`${music.volume} %`}
          style={{ '--value': `${music.volume}%` } as CSSProperties}
          onChange={(event) => music.setVolume(Number(event.target.value))}
        />
        <span className="volume-value" aria-hidden>
          {music.volume} %
        </span>
      </div>
    </Card>
  );
}

function Accounts({ music }: { music: Music }) {
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const { player } = music;
  const active = player.status === 'idle' ? null : player.account.permalink;

  async function add(event: FormEvent) {
    event.preventDefault();
    if (!input.trim() || busy) return;
    setBusy(true);
    const error = await music.add(input);
    setBusy(false);
    setMessage(error);
    if (!error) setInput('');
  }

  return (
    <Card title="Accounts & Playlists">
      <form className="watchlist-add" onSubmit={add}>
        <label className="search">
          <input
            aria-label="SoundCloud-Profil oder Playlist"
            placeholder="SoundCloud-Profil oder Playlist-Link"
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              setMessage(null);
            }}
          />
        </label>
        <button className="filter-button" type="submit" disabled={!input.trim() || busy}>
          <Plus size={16} /> {busy ? 'Prüft …' : 'Hinzufügen'}
        </button>
      </form>
      {message && (
        <p className="form-message" role="status">
          {message}
        </p>
      )}
      {music.saveFailed && (
        <p className="form-message" role="status">
          Speichern nicht verfügbar.
        </p>
      )}
      {music.accounts.length === 0 && <p className="form-message">Noch nichts hinzugefügt</p>}
      {music.accounts.map((account) => (
        <div className="watch-row" key={account.permalink}>
          <ChannelAvatar login={account.permalink} imageUrl={account.avatarUrl} />
          <div className="row-copy">
            <button
              className="music-link"
              title="Auf SoundCloud öffnen"
              onClick={() => openSoundCloud(account.url)}
            >
              <b>{account.name}</b>
            </button>
            <small>
              {isPlaylist(account)
                ? `Playlist · ${account.owner ?? ''}`
                : `soundcloud.com/${account.permalink}`}
            </small>
          </div>
          <button
            className={`filter-button ${active === account.permalink ? 'selected' : ''}`}
            aria-label={`Mix von ${account.name} abspielen`}
            onClick={() => music.startMix(account)}
          >
            <Shuffle size={15} /> Mix
          </button>
          <button
            className="icon-button"
            aria-label={`${account.name} entfernen`}
            title="Entfernen"
            onClick={() => music.remove(account.permalink)}
          >
            <Trash2 size={15} />
          </button>
        </div>
      ))}
    </Card>
  );
}

/** SoundCloud mixes: saved accounts, "Mix" plays their tracks in random order. */
export function MusicPage({ music }: { music: Music }) {
  return (
    <div className="music-layout">
      <NowPlaying music={music} />
      <Accounts music={music} />
    </div>
  );
}
