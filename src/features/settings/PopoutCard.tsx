import { useEffect, useState, type CSSProperties, type FormEvent } from 'react';
import { X } from 'lucide-react';
import { Badge, Card } from '../../components/ui';
import { readMedia } from '../../adapters/media';
import { countScreens, hasPopouts, showPopout } from '../../platform/popout';
import {
  MAX_FILTER_APPS,
  popoutBackgrounds,
  popoutEasings,
  popoutFilters,
  popoutPlaces,
  popoutScreens,
  popoutSpeeds,
  popoutThemes,
  readFilterApps,
  trayClicks,
} from '../popouts/placement';
import type { Preferences } from './preferences';

type Flag = {
  [K in keyof Preferences]: Preferences[K] extends boolean ? K : never;
}[keyof Preferences];
type Seconds = 'popoutMusicSeconds' | 'popoutNoticeSeconds' | 'popoutUpNextSeconds';

/**
 * Settings → Popouts, after FluentFlyout's settings: what shows, for how long, how it looks, where,
 * and which players count. Every change is saved at once and applies to an open popout too.
 */
export function PopoutCard({
  preferences: p,
  update,
}: {
  preferences: Preferences;
  update: (next: Preferences) => void;
}) {
  // The choice of screen only with more than one screen.
  const [screens, setScreens] = useState(1);
  useEffect(() => {
    if (hasPopouts) void countScreens().then(setScreens);
  }, []);
  const [heldBack, setHeldBack] = useState(false);
  const [appInput, setAppInput] = useState('');
  const [appNote, setAppNote] = useState<string | null>(null);
  // Windows' "Animationseffekte" off (reduced motion): popouts only slide if that is overridden.
  const systemCalm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const calmBlocks = systemCalm && !p.popoutMotionAlways;

  if (!hasPopouts)
    return (
      <Card title="Popouts">
        <div className="setting-row">
          <div>
            <h3>Popouts</h3>
          </div>
          <Badge>Nur in der Desktop-App</Badge>
        </div>
      </Card>
    );

  const off = !p.popouts;
  const music = !off && p.popoutMusic;
  const large = music && !p.popoutCompact;

  /** Saves; with `sample`, shows a sample popout with the new setting. */
  function change(next: Preferences, sample = false) {
    update(next);
    if (sample)
      void showPopout(
        { kind: 'test', id: Date.now() },
        { overFullScreen: next.popoutFullscreen, acrylic: next.popoutAcrylic },
      ).then((shown) => setHeldBack(!shown));
  }

  const group = (title: string) => <h3 className="setting-group">{title}</h3>;

  const toggle = (key: Flag, title: string, note: string | null, disabled = off) => (
    <div className="setting-row">
      <div>
        <h3>{title}</h3>
        {note && <p>{note}</p>}
      </div>
      <button
        className="switch"
        role="switch"
        aria-checked={p[key]}
        aria-label={title}
        disabled={disabled}
        onClick={() => change({ ...p, [key]: !p[key] })}
      >
        <span />
      </button>
    </div>
  );

  const choice = <T extends string | number>(
    title: string,
    note: string | null,
    options: readonly { id: T; name: string }[],
    value: T,
    set: (id: T) => Preferences,
    disabled = off,
    sample = false,
  ) => (
    <div className="setting-row">
      <div>
        <h3>{title}</h3>
        {note && <p>{note}</p>}
      </div>
      <div className="segment-picker" role="group" aria-label={title}>
        {options.map((o) => (
          <button
            key={String(o.id)}
            className={`filter-button ${value === o.id ? 'selected' : ''}`}
            aria-pressed={value === o.id}
            disabled={disabled}
            onClick={() => change(set(o.id), sample)}
          >
            {o.name}
          </button>
        ))}
      </div>
    </div>
  );

  const slider = (
    key: Seconds | 'popoutOpacity',
    title: string,
    note: string | null,
    [min, max, step]: [number, number, number],
    unit: string,
    disabled: boolean,
  ) => (
    <div className="setting-row">
      <div>
        <h3>{title}</h3>
        {note && <p>{note}</p>}
      </div>
      <input
        type="range"
        className="volume-slider"
        min={min}
        max={max}
        step={step}
        value={p[key]}
        disabled={disabled}
        aria-label={title}
        aria-valuetext={`${p[key]} ${unit}`}
        style={{ '--value': `${((p[key] - min) / (max - min)) * 100}%` } as CSSProperties}
        onChange={(event) => change({ ...p, [key]: Number(event.target.value) })}
      />
      <span className="volume-value" aria-hidden>
        {p[key]} {unit}
      </span>
    </div>
  );

  function addApp(name: string) {
    const apps = readFilterApps([...p.popoutApps, name]);
    if (apps.length === p.popoutApps.length) {
      setAppNote(
        p.popoutApps.length >= MAX_FILTER_APPS
          ? `Höchstens ${MAX_FILTER_APPS} Apps.`
          : 'Ist schon in der Liste.',
      );
      return;
    }
    setAppNote(null);
    change({ ...p, popoutApps: apps });
  }
  function submitApp(event: FormEvent) {
    event.preventDefault();
    if (appInput.trim()) addApp(appInput);
    setAppInput('');
  }
  async function addPlaying() {
    const now = await readMedia?.().catch(() => null);
    if (now) addApp(now.app);
    else setAppNote('Gerade spielt keine App etwas.');
  }

  const place = popoutPlaces.find((pl) => pl.id === p.popoutPlace) ?? popoutPlaces[4];
  const screen = popoutScreens.find((s) => s.id === p.popoutScreen) ?? popoutScreens[0];
  return (
    <Card title="Popouts">
      <div className="setting-row">
        <div>
          <h3>Popouts</h3>
          <p>Kleine Anzeige, wenn blank. im Hintergrund ist</p>
        </div>
        <button className="text-link" disabled={off} onClick={() => change(p, true)}>
          Testen
        </button>
        <button
          className="switch"
          role="switch"
          aria-checked={p.popouts}
          aria-label="Popouts"
          onClick={() => change({ ...p, popouts: !p.popouts })}
        >
          <span />
        </button>
      </div>
      {heldBack && !off && (
        <p className="section-note" role="status">
          Gerade läuft etwas im Vollbild – Popouts warten („Auch bei Vollbild“ zeigt sie trotzdem).
        </p>
      )}
      {toggle('popoutFullscreen', 'Auch bei Vollbild', 'Über Spielen, Videos und Präsentationen')}
      {toggle('popoutInFront', 'Auch wenn blank. vorne ist', null)}
      {choice(
        'Klick auf das Symbol im Infobereich',
        null,
        trayClicks,
        p.trayClick,
        (trayClick) => ({ ...p, trayClick }),
        false,
      )}

      {group('Musik')}
      {toggle(
        'popoutMusic',
        'Musik',
        'Spotify, YouTube, Browser und dein Mix – bei jedem neuen Lied',
      )}
      {toggle(
        'popoutMusicToggle',
        'Auch bei Pause und Weiter',
        'z. B. mit den Medientasten',
        !music,
      )}
      {toggle(
        'popoutMusicAlways',
        'Immer anzeigen',
        'Bleibt, solange Musik läuft, bis du schließt',
        !music,
      )}
      {slider(
        'popoutMusicSeconds',
        'Anzeigedauer',
        null,
        [1, 30, 1],
        's',
        !music || p.popoutMusicAlways,
      )}
      {choice(
        'Layout',
        p.popoutCompact ? 'Schmale Zeile ohne Extras' : 'Groß mit Cover',
        [
          { id: 'normal', name: 'Normal' },
          { id: 'compact', name: 'Kompakt' },
        ] as const,
        p.popoutCompact ? 'compact' : 'normal',
        (id) => ({ ...p, popoutCompact: id === 'compact' }),
        !music,
        true,
      )}
      {toggle('popoutCenter', 'Titel und Künstler zentrieren', null, !large)}
      {toggle(
        'popoutPlayerName',
        'Player-Name anzeigen',
        'Ein Klick darauf öffnet den Player',
        !large,
      )}
      {toggle(
        'popoutSeek',
        'Fortschrittsbalken',
        'Zeit und Spulen, wenn der Player es kann',
        !large,
      )}
      {toggle(
        'popoutRepeat',
        'Wiederholen-Knopf',
        'Wenn der Player es kann; macht das Popout breiter',
        !large,
      )}
      {toggle(
        'popoutShuffle',
        'Zufall-Knopf',
        'Wenn der Player es kann; macht das Popout breiter',
        !large,
      )}
      {toggle(
        'popoutPauseOthers',
        'Andere Medien automatisch pausieren',
        'Startet ein Player, halten die anderen an',
        off,
      )}
      {toggle('popoutUpNext', '„Als Nächstes“', 'Klein, wenn ein Lied von selbst folgt', !music)}
      {slider(
        'popoutUpNextSeconds',
        'Anzeigedauer „Als Nächstes“',
        null,
        [1, 10, 1],
        's',
        !music || !p.popoutUpNext,
      )}

      {group('Apps')}
      {choice(
        'Welche Apps',
        null,
        popoutFilters,
        p.popoutFilter,
        (popoutFilter) => ({ ...p, popoutFilter }),
        !music,
      )}
      {p.popoutFilter !== 'off' && (
        <div className="filter-apps">
          <div className="filter-app-list">
            {p.popoutApps.length === 0 && (
              <p className="section-note">Noch keine App eingetragen.</p>
            )}
            {p.popoutApps.map((app) => (
              <span className="filter-app" key={app}>
                {app}
                <button
                  aria-label={`${app} entfernen`}
                  title="Entfernen"
                  onClick={() =>
                    change({ ...p, popoutApps: p.popoutApps.filter((a) => a !== app) })
                  }
                >
                  <X size={12} />
                </button>
              </span>
            ))}
          </div>
          <form className="filter-app-add" onSubmit={submitApp}>
            <label className="search">
              <input
                value={appInput}
                maxLength={60}
                placeholder="App, z. B. Spotify oder Chrome"
                aria-label="App hinzufügen"
                onChange={(event) => setAppInput(event.target.value)}
              />
            </label>
            <button className="filter-button" type="submit" disabled={!appInput.trim()}>
              Hinzufügen
            </button>
            <button className="filter-button" type="button" onClick={() => void addPlaying()}>
              Die gerade spielt
            </button>
          </form>
          {appNote && (
            <p className="form-message" role="status">
              {appNote}
            </p>
          )}
          <p className="section-note">Dein Mix in blank. heißt hier „blank.“.</p>
        </div>
      )}

      {group('Meldungen')}
      {toggle('popoutLive', 'Live-Meldungen', 'Wer auf Twitch live geht')}
      {toggle('popoutWarnings', 'Warnungen', 'Akku und Überlastung')}
      {toggle('popoutNoticeAlways', 'Immer anzeigen', 'Bleibt, bis du schließt')}
      {slider(
        'popoutNoticeSeconds',
        'Anzeigedauer',
        null,
        [1, 30, 1],
        's',
        off || p.popoutNoticeAlways,
      )}

      {group('Aussehen')}
      {choice(
        'Farben',
        null,
        popoutThemes,
        p.popoutTheme,
        (popoutTheme) => ({ ...p, popoutTheme }),
        off,
        true,
      )}
      {choice(
        'Hintergrund',
        'Hinter der Musik, aus dem Cover',
        popoutBackgrounds,
        p.popoutBackground,
        (popoutBackground) => ({ ...p, popoutBackground }),
        !large,
      )}
      {toggle('popoutCoverAccent', 'Cover-Farbe als Akzent', 'Für Knöpfe und Balken', !music)}
      {slider(
        'popoutOpacity',
        'Deckkraft',
        'Unter 100 % scheint durch, was dahinter liegt',
        [20, 100, 5],
        '%',
        off,
      )}
      {toggle(
        'popoutAcrylic',
        'Acrylic',
        'Dahinter unscharf; die Unschärfe erscheint ohne Übergang',
      )}
      {choice(
        'Hineingleiten',
        !p.motion
          ? 'Aus, solange „Animationen“ aus ist'
          : calmBlocks
            ? 'Aus, weil die Animationseffekte in Windows aus sind'
            : 'Durchsichtig herein- und hinausgleiten',
        popoutSpeeds,
        p.popoutSpeed,
        (popoutSpeed) => ({ ...p, popoutSpeed }),
        off || !p.motion || calmBlocks,
        true,
      )}
      {choice(
        'Verlauf',
        null,
        popoutEasings,
        p.popoutEasing,
        (popoutEasing) => ({ ...p, popoutEasing }),
        off || !p.motion || calmBlocks || p.popoutSpeed === 0,
        true,
      )}
      {toggle(
        'popoutMotionAlways',
        'Auch wenn Windows-Animationen aus sind',
        systemCalm ? 'Bei dir sind sie in Windows aus' : null,
        off || !p.motion || p.popoutSpeed === 0,
      )}

      {group('Position')}
      <div className="setting-row">
        <div>
          <h3>Stelle</h3>
          <p>{place.name}</p>
        </div>
        <div className="place-picker" role="group" aria-label="Position der Popouts">
          {popoutPlaces.map((pl) => (
            <button
              key={pl.id}
              className="place-choice"
              aria-label={pl.name}
              aria-pressed={p.popoutPlace === pl.id}
              title={pl.name}
              disabled={off}
              onClick={() => change({ ...p, popoutPlace: pl.id }, true)}
            >
              <span />
            </button>
          ))}
        </div>
      </div>
      {screens > 1 &&
        choice(
          'Bildschirm',
          screen.name,
          popoutScreens.map((s) => ({ id: s.id, name: s.short })),
          p.popoutScreen,
          (popoutScreen) => ({ ...p, popoutScreen }),
          off,
          true,
        )}
    </Card>
  );
}
