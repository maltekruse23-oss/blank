import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { Music2, Pause, Play, Repeat, Repeat1, Shuffle, SkipBack, SkipForward } from 'lucide-react';
import type { MediaAction, Timeline } from '../../adapters/media';
import type { Preferences } from '../settings/preferences';
import { clock, nextRepeat, positionOf, type Playing } from './playing';

function Seekbar({ playing }: { playing: Playing }) {
  const [now, setNow] = useState(Date.now());
  const [drag, setDrag] = useState<number | null>(null);
  const [jumped, setJumped] = useState<Timeline | null>(null);
  const timeline = jumped ?? playing.timeline;
  // Only while the popout is on screen, once a second.
  useEffect(() => {
    if (!playing.playing) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [playing.playing]);
  // A newer report from the player replaces the own jump.
  const reported = playing.timeline
    ? `${playing.timeline.position}|${playing.timeline.updatedAt}`
    : '';
  useEffect(() => setJumped(null), [reported]);
  if (!timeline) return null;
  const position = drag ?? positionOf(timeline, playing.playing, now);
  const canSeek = timeline.canSeek && playing.seek !== null;
  const commit = () => {
    if (drag === null || !playing.seek) return;
    setJumped({ ...timeline, position: drag, updatedAt: Date.now() });
    setDrag(null);
    void playing.seek(drag).catch(() => undefined);
  };
  return (
    <div className="popout-seek">
      <span>{clock(position)}</span>
      <input
        type="range"
        min={0}
        max={Math.ceil(timeline.duration)}
        step={1}
        value={Math.round(position)}
        disabled={!canSeek}
        aria-label="Stelle im Titel"
        aria-valuetext={`${clock(position)} von ${clock(timeline.duration)}`}
        style={{ '--value': `${(position / timeline.duration) * 100}%` } as CSSProperties}
        onChange={(event) => setDrag(Number(event.target.value))}
        onPointerUp={commit}
        onKeyUp={commit}
      />
      <span>{clock(timeline.duration)}</span>
    </div>
  );
}

/**
 * The compact popout's progress (user's wish): a slim bar where the buttons were, how far the
 * track or video has played. Nothing without a length (a Twitch live stream) or with "Fortschritt"
 * off. Moves on once a second, only while it plays and the popout is on screen; hovering opens the
 * full popout with pause and the seek bar.
 */
function MiniProgress({ playing }: { playing: Playing }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!playing.playing) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [playing.playing]);
  const timeline = playing.timeline;
  if (!timeline || !(timeline.duration > 0)) return null;
  const share = positionOf(timeline, playing.playing, now) / timeline.duration;
  return (
    <span
      className="popout-mini-progress"
      role="progressbar"
      aria-label="Fortschritt"
      aria-valuemin={0}
      aria-valuemax={Math.ceil(timeline.duration)}
      aria-valuenow={Math.round(share * timeline.duration)}
      style={{ '--value': `${share * 100}%` } as CSSProperties}
    />
  );
}

function Cover({ src, size }: { src: string | null; size: number }) {
  return src ? (
    <img className="popout-cover" src={src} alt="" />
  ) : (
    <span className="popout-cover empty">
      <Music2 size={size} />
    </span>
  );
}

/** What a click changes, shown at once; the player's next report replaces it. */
type Guess = Partial<Pick<Playing, 'playing' | 'repeat' | 'shuffle'>>;
/** If a player never answers, the guess goes after this long. */
const GUESS_MS = 3_000;

export function MusicPopout({
  playing: reported,
  look,
  compact,
}: {
  playing: Playing;
  look: Preferences;
  /** One slim row; hovering a compact popout shows the full one (the window decides). */
  compact: boolean;
}) {
  const [failed, setFailed] = useState<string | null>(null);
  // Instant feedback: pause, repeat and shuffle change on the click, not when the player reports.
  const [guess, setGuess] = useState<Guess | null>(null);
  const reportKey = `${reported.title}|${reported.playing}|${reported.repeat}|${reported.shuffle}`;
  useEffect(() => setGuess(null), [reportKey]);
  useEffect(() => {
    if (!guess) return;
    const timer = window.setTimeout(() => setGuess(null), GUESS_MS);
    return () => window.clearTimeout(timer);
  }, [guess]);
  const playing: Playing = { ...reported, ...guess };
  const run = (action: MediaAction) => {
    setFailed(null);
    if (action === 'toggle') setGuess((g) => ({ ...g, playing: !playing.playing }));
    if (action === 'repeat' && playing.repeat)
      setGuess((g) => ({ ...g, repeat: nextRepeat[playing.repeat!] }));
    if (action === 'shuffle' && playing.shuffle !== null)
      setGuess((g) => ({ ...g, shuffle: !playing.shuffle }));
    reported.run(action).catch(() => {
      setGuess(null);
      setFailed(`${playing.app} reagiert nicht`);
    });
  };
  const open = () => {
    setFailed(null);
    playing.open().catch(() => setFailed(`${playing.app} nicht gefunden`));
  };
  const button = (
    action: MediaAction,
    label: string,
    enabled: boolean,
    icon: ReactNode,
    extra = '',
    pressed?: boolean,
  ) => (
    <button
      className={`popout-button ${extra}`}
      aria-label={label}
      aria-pressed={pressed}
      title={label}
      disabled={!enabled}
      onClick={() => run(action)}
    >
      {icon}
    </button>
  );
  const main = (
    <>
      {button(
        'previous',
        'Vorheriger Titel',
        playing.canPrevious,
        <SkipBack size={16} fill="currentColor" />,
      )}
      {button(
        'toggle',
        playing.playing ? 'Pause' : 'Abspielen',
        playing.canToggle,
        playing.playing ? (
          <Pause size={16} fill="currentColor" />
        ) : (
          <Play size={16} fill="currentColor" />
        ),
        'play',
      )}
      {button(
        'next',
        'Nächster Titel',
        playing.canNext,
        <SkipForward size={16} fill="currentColor" />,
      )}
    </>
  );
  const artist = failed ?? playing.artist;
  if (compact)
    return (
      <div className="popout-media compact">
        <Cover src={playing.cover} size={18} />
        <div className="popout-now">
          <b title={playing.title}>{playing.title}</b>
          <span title={`${playing.artist} · ${playing.app}`}>{artist || playing.app}</span>
        </div>
        {look.popoutSeek && <MiniProgress playing={playing} />}
      </div>
    );
  const repeatLabel =
    playing.repeat === 'one'
      ? 'Wiederholen: dieser Titel'
      : playing.repeat === 'all'
        ? 'Wiederholen: alle'
        : 'Wiederholen: aus';
  return (
    <>
      <div className="popout-media">
        <Cover src={playing.cover} size={28} />
        <div className={`popout-now ${look.popoutCenter ? '' : 'left'}`}>
          <b title={playing.title}>{playing.title}</b>
          {artist && <span title={artist}>{artist}</span>}
          <div className="popout-controls">
            {main}
            {look.popoutRepeat &&
              button(
                'repeat',
                repeatLabel,
                playing.canRepeat,
                playing.repeat === 'one' ? <Repeat1 size={15} /> : <Repeat size={15} />,
                playing.repeat && playing.repeat !== 'none' ? 'on' : '',
                playing.repeat === null ? undefined : playing.repeat !== 'none',
              )}
            {look.popoutShuffle &&
              button(
                'shuffle',
                playing.shuffle ? 'Zufall: an' : 'Zufall: aus',
                playing.canShuffle,
                <Shuffle size={15} />,
                playing.shuffle ? 'on' : '',
                playing.shuffle ?? undefined,
              )}
            {look.popoutPlayerName && (
              <button className="popout-app" title={`${playing.app} öffnen`} onClick={open}>
                <Music2 size={12} />
                <span>{playing.app}</span>
              </button>
            )}
          </div>
        </div>
      </div>
      {look.popoutSeek && <Seekbar playing={playing} />}
    </>
  );
}

/** "Als Nächstes": small, after a track ended and the next one started by itself. */
export function UpNextPopout({ playing }: { playing: Playing }) {
  return (
    <div className="popout-row upnext">
      <span className="popout-label">
        <Music2 size={14} /> Als Nächstes:
      </span>
      <Cover src={playing.cover} size={16} />
      <span className="popout-text">
        <b title={playing.title}>{playing.title}</b>
        {playing.artist && <small>{playing.artist}</small>}
      </span>
    </div>
  );
}
