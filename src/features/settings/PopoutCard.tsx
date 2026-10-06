import { useContext, useEffect, useRef, useState, type CSSProperties, type FormEvent } from 'react';
import { Move, X } from 'lucide-react';
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
import { More, Searching } from './More';
import { TabContent, TabPill } from '../../components/TabMotion';
import type { Preferences } from './preferences';
import { SAMPLE_CHAMP, showChampCard } from '../aram/useChampCard';

type Flag = {
  [K in keyof Preferences]: Preferences[K] extends boolean ? K : never;
}[keyof Preferences];
type Seconds = 'popoutMusicSeconds' | 'popoutNoticeSeconds' | 'popoutUpNextSeconds';

export type PopoutPart = 'general' | 'music' | 'notices' | 'look';
export const popoutParts: { id: PopoutPart; name: string }[] = [
  { id: 'general', name: 'Allgemein' },
  { id: 'music', name: 'Musik' },
  { id: 'notices', name: 'Meldungen' },
  { id: 'look', name: 'Aussehen' },
];

/**
 * Settings → Popouts, after FluentFlyout's settings, in four parts. Every change is saved at once
 * and shows a live preview popout (a sample track or notice) that follows each further change.
 * The place (six places, taskbar, screen) is set by dragging in the edit mode: `onPlace` goes
 * there (user's wish: dragged, not picked twice).
 */
export function PopoutCard({
  preferences: p,
  update,
  onPlace,
}: {
  preferences: Preferences;
  update: (next: Preferences) => void;
  /** Into the edit mode, where the popout is dragged to its place. */
  onPlace: () => void;
}) {
  const searching = useContext(Searching);
  const [part, setPart] = useState<PopoutPart>('general');
  const lastPart = useRef(part);
  const partIndex = (id: PopoutPart) => popoutParts.findIndex((pt) => pt.id === id);
  const partDir = partIndex(part) < partIndex(lastPart.current) ? -1 : 1;
  useEffect(() => {
    lastPart.current = part;
  }, [part]);
  // The choice of screen only with more than one screen.
  const [screens, setScreens] = useState(1);
  useEffect(() => {
    if (hasPopouts) void countScreens().then(setScreens);
  }, []);
  const [heldBack, setHeldBack] = useState(false);
  const [appInput, setAppInput] = useState('');
  const [appNote, setAppNote] = useState<string | null>(null);
  const [champNote, setChampNote] = useState<string | null>(null);
  /** One preview per visit: every change updates it in place instead of a new one sliding in. */
  const previewId = useRef(Date.now() % 1_000_000_000).current;
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

  /** Saves, and shows the change live in the preview popout (not while popouts are off). */
  function changeWith(next: Preferences, topic: 'music' | 'notice') {
    update(next);
    if (!next.popouts) return;
    void showPopout(
      { kind: 'preview', id: previewId, topic, stamp: Date.now() },
      { overFullScreen: true, acrylic: next.popoutAcrylic && !next.popoutTaskbar },
    ).then((shown) => setHeldBack(!shown));
  }

  /** The champ card without a game: the user's example champion with the website's real numbers. */
  function champSample() {
    setChampNote(null);
    void showChampCard(SAMPLE_CHAMP, p)
      .then((shown) => setHeldBack(!shown))
      .catch(() => setChampNote('mayhemstats.lol hat nicht geantwortet.'));
  }

  function sample() {
    void showPopout(
      { kind: 'test', id: Date.now() },
      {
        overFullScreen: p.popoutFullscreen,
        acrylic: p.popoutAcrylic && !p.popoutTaskbar,
        screen: p.popoutScreen,
      },
    ).then((shown) => setHeldBack(!shown));
  }

  /** The rows of one part; the preview shows what that part changes. */
  function rows(of: PopoutPart) {
    const topic = (next: Preferences) =>
      of === 'notices' || (of === 'general' && !next.popoutMusic) ? 'notice' : 'music';
    const change = (next: Preferences) => changeWith(next, topic(next));

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
              onClick={() => change(set(o.id))}
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

    switch (of) {
      case 'general':
        return (
          <>
            <div className="setting-row">
              <div>
                <h3>Popouts</h3>
                <p>Kleine Anzeige, wenn blank. im Hintergrund ist</p>
              </div>
              <button className="text-link" disabled={off} onClick={sample}>
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
                Gerade läuft etwas im Vollbild – Popouts warten („Auch bei Vollbild“ zeigt sie
                trotzdem).
              </p>
            )}
            {/* Place and screen are set in the popout tool of the edit mode, nowhere else. */}
            <div className="setting-row">
              <div>
                <h3>{screens > 1 ? 'Platz und Bildschirm' : 'Platz'}</h3>
                <p>
                  {p.popoutTaskbar ? 'In der Taskleiste' : place.name}
                  {screens > 1 ? ` · ${screen.name}` : ' · Stelle, Taskleiste'}
                </p>
              </div>
              <button className="filter-button" disabled={off} onClick={onPlace}>
                <Move size={13} /> Hinziehen
              </button>
            </div>
            <More count={3}>
              {toggle(
                'popoutFullscreen',
                'Auch bei Vollbild',
                'Über Spielen, Videos und Präsentationen',
              )}
              {toggle('popoutInFront', 'Auch wenn blank. vorne ist', null)}
              {choice(
                'Klick auf das Symbol im Infobereich',
                null,
                trayClicks,
                p.trayClick,
                (trayClick) => ({ ...p, trayClick }),
                false,
              )}
            </More>
          </>
        );
      case 'music':
        return (
          <>
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
              p.popoutCompact
                ? 'Schmale Zeile; mit der Maus darauf klappt es auf'
                : 'Groß mit Cover',
              [
                { id: 'normal', name: 'Normal' },
                { id: 'compact', name: 'Kompakt' },
              ] as const,
              p.popoutCompact ? 'compact' : 'normal',
              (id) => ({ ...p, popoutCompact: id === 'compact' }),
              !music,
            )}
            {toggle(
              'popoutSeek',
              'Fortschrittsbalken',
              p.popoutCompact
                ? 'Beim Aufklappen; Zeit und Spulen, wenn der Player es kann'
                : 'Zeit und Spulen, wenn der Player es kann',
              !music,
            )}
            <More count={8}>
              {toggle('popoutCenter', 'Titel und Künstler zentrieren', null, !music)}
              {toggle(
                'popoutPlayerName',
                'Player-Name anzeigen',
                'Ein Klick darauf öffnet den Player',
                !music,
              )}
              {toggle(
                'popoutRepeat',
                'Wiederholen-Knopf',
                'Wenn der Player es kann; macht das Popout breiter',
                !music,
              )}
              {toggle(
                'popoutShuffle',
                'Zufall-Knopf',
                'Wenn der Player es kann; macht das Popout breiter',
                !music,
              )}
              {toggle(
                'popoutPauseOthers',
                'Andere Medien automatisch pausieren',
                'Startet ein Player, halten die anderen an',
              )}
              {toggle(
                'popoutUpNext',
                '„Als Nächstes“',
                'Klein, wenn ein Lied von selbst folgt',
                !music,
              )}
              {slider(
                'popoutUpNextSeconds',
                'Anzeigedauer „Als Nächstes“',
                null,
                [1, 10, 1],
                's',
                !music || !p.popoutUpNext,
              )}
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
                    <button
                      className="filter-button"
                      type="button"
                      onClick={() => void addPlaying()}
                    >
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
            </More>
          </>
        );
      case 'notices':
        return (
          <>
            {toggle('popoutLive', 'Live-Meldungen', 'Wer auf Twitch live geht')}
            {toggle('popoutWarnings', 'Warnungen', 'Akku und Überlastung')}
            {toggle('popoutAram', 'ARAM-Ergebnis', 'Karte nach jedem ARAM-Mayhem-Spiel')}
            <div className="setting-row">
              <div>
                <h3>Champ-Karte</h3>
                <p>Augments und Builds in der Champ-Auswahl</p>
              </div>
              <button className="text-link" disabled={off} onClick={champSample}>
                Testen
              </button>
              <button
                className="switch"
                role="switch"
                aria-checked={p.popoutChamp}
                aria-label="Champ-Karte"
                disabled={off}
                onClick={() => change({ ...p, popoutChamp: !p.popoutChamp })}
              >
                <span />
              </button>
            </div>
            {champNote && (
              <p className="form-message" role="status">
                {champNote}
              </p>
            )}
            {toggle('popoutNoticeAlways', 'Immer anzeigen', 'Bleibt, bis du schließt')}
            {slider(
              'popoutNoticeSeconds',
              'Anzeigedauer',
              null,
              [1, 30, 1],
              's',
              off || p.popoutNoticeAlways,
            )}
          </>
        );
      case 'look':
        return (
          <>
            {choice('Farben', null, popoutThemes, p.popoutTheme, (popoutTheme) => ({
              ...p,
              popoutTheme,
            }))}
            {choice(
              'Hintergrund',
              'Hinter der Musik, aus dem Cover',
              popoutBackgrounds,
              p.popoutBackground,
              (popoutBackground) => ({ ...p, popoutBackground }),
              !music,
            )}
            {slider(
              'popoutOpacity',
              'Deckkraft',
              'Unter 100 % scheint durch, was dahinter liegt',
              [20, 100, 5],
              '%',
              off,
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
            )}
            <More count={4}>
              {toggle(
                'popoutCoverAccent',
                'Cover-Farbe als Akzent',
                'Für Knöpfe und Balken',
                !music,
              )}
              {toggle(
                'popoutAcrylic',
                'Acrylic',
                'Dahinter unscharf; die Unschärfe erscheint ohne Übergang',
              )}
              {choice(
                'Verlauf',
                null,
                popoutEasings,
                p.popoutEasing,
                (popoutEasing) => ({ ...p, popoutEasing }),
                off || !p.motion || calmBlocks || p.popoutSpeed === 0,
              )}
              {toggle(
                'popoutMotionAlways',
                'Auch wenn Windows-Animationen aus sind',
                systemCalm ? 'Bei dir sind sie in Windows aus' : null,
                off || !p.motion || p.popoutSpeed === 0,
              )}
            </More>
          </>
        );
    }
  }

  // Searching shows every part (with its name), otherwise only the chosen one.
  if (searching)
    return (
      <Card title="Popouts">
        {popoutParts.map((pt) => (
          <div key={pt.id}>
            <h3 className="setting-group">{pt.name}</h3>
            {rows(pt.id)}
          </div>
        ))}
      </Card>
    );
  return (
    <Card title="Popouts">
      <div className="settings-parts segment-picker" role="tablist" aria-label="Popouts">
        {popoutParts.map((pt) => (
          <button
            key={pt.id}
            role="tab"
            aria-selected={part === pt.id}
            className={`filter-button ${part === pt.id ? 'selected' : ''}`}
            onClick={() => setPart(pt.id)}
          >
            {part === pt.id && <TabPill group="popout-part" />}
            <span className="tab-label">{pt.name}</span>
          </button>
        ))}
      </div>
      <TabContent
        id={part}
        dir={partDir}
        className="tab-enter"
        role="tabpanel"
        label={popoutParts.find((pt) => pt.id === part)?.name}
      >
        {rows(part)}
      </TabContent>
    </Card>
  );
}
