import { useEffect, useRef } from 'react';
import {
  mediaSettings,
  onMediaChanged,
  pauseOtherMedia,
  readMedia,
  trackKey,
  type NowPlaying,
} from '../../adapters/media';
import {
  hasPopouts,
  onMixControl,
  onOpenPage,
  onPopoutDone,
  onTrayMusic,
  setTrayClick,
  showPopout,
  updatePopout,
  type MixItem,
  type PopoutItem,
} from '../../platform/popout';
import { warningText, type Warning } from '../../app/useWarnings';
import type { Page } from '../../app/App';
import type { Music } from '../music/useMusic';
import type { Preferences } from '../settings/preferences';
import type { GoLiveAlert } from '../twitch/useGoLiveAlerts';
import { passesFilter } from './placement';

/** The own mix in the app filter (Settings → Popouts → Apps). */
const MIX_APP = 'blank.';

/**
 * Hands notices to the popout window (src-tauri/src/flyout.rs), each kind as set in Settings →
 * Popouts: a channel that went live, a warning, music from any player or from blank.'s own mix
 * (new track – small "Als Nächstes" when it followed by itself, if wanted – and pause/resume).
 * Normally only while blank. is not the active window. The notices in the app stay as they are;
 * closing one in the popout closes it in the app too. The popout's buttons for the own mix come
 * back here, and an open mix popout follows every change of the mix without popping up again.
 */
export function usePopouts({
  preferences,
  mix,
  alerts,
  dismissAlert,
  warnings,
  dismissWarning,
  openPage,
}: {
  preferences: Preferences;
  /** blank.'s own SoundCloud mix. */
  mix: Music;
  alerts: GoLiveAlert[];
  dismissAlert: (id: number) => void;
  warnings: Warning[];
  dismissWarning: (id: number) => void;
  openPage: (page: Page) => void;
}) {
  const latest = useRef({ preferences, mix, dismissAlert, dismissWarning, openPage });
  latest.current = { preferences, mix, dismissAlert, dismissWarning, openPage };

  /** Switched on, not "Nicht stören", the kind wanted, and blank. not in front (unless set). */
  const wanted = (kind: 'music' | 'toggle' | 'live' | 'warning', app?: string) => {
    const p = latest.current.preferences;
    const kindOn =
      kind === 'music'
        ? p.popoutMusic
        : kind === 'toggle'
          ? p.popoutMusic && p.popoutMusicToggle
          : kind === 'live'
            ? p.popoutLive
            : p.popoutWarnings;
    return (
      hasPopouts &&
      p.popouts &&
      !p.quiet &&
      kindOn &&
      (app === undefined || passesFilter(app, p.popoutFilter, p.popoutApps)) &&
      (p.popoutInFront || !document.hasFocus())
    );
  };
  /** `explicit`: asked for by a click (icon in the notification area), so also over full screen. */
  const show = (item: PopoutItem, explicit = false) => {
    const p = latest.current.preferences;
    return showPopout(item, {
      overFullScreen: explicit || p.popoutFullscreen,
      acrylic: p.popoutAcrylic && !p.popoutTaskbar,
      screen: p.popoutScreen,
    });
  };

  // Rust needs two settings itself: pausing other players, and the icon's left click.
  useEffect(() => {
    void mediaSettings?.(preferences.popoutPauseOthers).catch(() => undefined);
  }, [preferences.popoutPauseOthers]);
  useEffect(() => {
    if (hasPopouts) void setTrayClick(preferences.trayClick === 'music');
  }, [preferences.trayClick]);

  const player = mix.player;
  const mixTrack = player.status === 'playing' || player.status === 'paused' ? player.track : null;
  const mixKey = mixTrack ? `${mixTrack.title}\n${mixTrack.artist}` : '';
  const mixPlaying = player.status === 'playing';
  const mixAuto = player.status === 'playing' && player.auto === true;
  const mixId = useRef(0);

  /** The own mix as a popout item; `position` (ms) right after a jump, otherwise asked. */
  async function mixItem(position?: number, upNext = false): Promise<MixItem | null> {
    const { player } = latest.current.mix;
    if ((player.status !== 'playing' && player.status !== 'paused') || !player.track) return null;
    const { title, artist, artworkUrl, durationMs } = player.track;
    const at = await (position ?? latest.current.mix.position().catch(() => undefined));
    return {
      kind: 'mix',
      id: ++mixId.current,
      title,
      artist,
      cover: artworkUrl,
      playing: player.status === 'playing',
      position: typeof at === 'number' ? at : null,
      duration: durationMs,
      at: Date.now(),
      upNext,
    };
  }

  // Other players: a new track while playing (small "Als Nächstes" if it followed by itself and
  // that is switched on), and if wanted pause and resume of the same track. The first report after
  // start is only the baseline; a later cover of the same track is no change. An open music popout
  // follows by itself (media-changed). blank.'s own mix is handled below, in case the WebView
  // reports it to Windows too.
  useEffect(() => {
    if (!readMedia || !onMediaChanged) return;
    let last: { key: string; playing: boolean } | undefined;
    let id = 0;
    const seen = (now: NowPlaying | null) => {
      const before = last;
      const key = now ? trackKey(now) : '';
      last = { key, playing: now?.playing ?? false };
      if (!before || !now) return;
      const own = latest.current.mix.player;
      const ownTitle = 'track' in own && own.track ? own.track.title : null;
      if (
        own.status !== 'idle' &&
        (now.app === 'blank.' || /webview/i.test(now.app) || now.title === ownTitle)
      )
        return;
      const upNext = latest.current.preferences.popoutUpNext && now.byItself;
      if (key !== before.key && now.playing && wanted('music', now.app))
        void show({ kind: 'music', id: ++id, upNext });
      else if (key === before.key && now.playing !== before.playing && wanted('toggle', now.app))
        void show({ kind: 'music', id: ++id });
    };
    void readMedia().then((now) => last === undefined && seen(now));
    return onMediaChanged(seen);
  }, []);

  // The own mix: new track while playing, pause, resume. Otherwise (not wanted, or blank. in
  // front) an open mix popout only gets the new state.
  const lastMix = useRef({ key: '', playing: false });
  useEffect(() => {
    const before = lastMix.current;
    lastMix.current = { key: mixKey, playing: mixPlaying };
    if (!mixKey) {
      // Stopped: an open mix popout goes away.
      if (before.key)
        void updatePopout({
          kind: 'mix',
          id: ++mixId.current,
          title: '',
          artist: '',
          cover: null,
          playing: false,
          position: null,
          duration: null,
          at: Date.now(),
          ended: true,
        });
      return;
    }
    // The mix starts or plays on: other players pause (a setting).
    if (mixPlaying && !before.playing && latest.current.preferences.popoutPauseOthers)
      void pauseOtherMedia?.().catch(() => undefined);
    const newTrack = mixKey !== before.key && mixPlaying;
    const toggled = mixKey === before.key && mixPlaying !== before.playing;
    const popUp = (newTrack && wanted('music', MIX_APP)) || (toggled && wanted('toggle', MIX_APP));
    const upNext = newTrack && mixAuto && latest.current.preferences.popoutUpNext;
    void mixItem(undefined, upNext).then((item) => {
      if (!item) return;
      if (popUp) void show(item);
      else void updatePopout(item);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only a change of track or play state pops up
  }, [mixKey, mixPlaying]);

  // New live notices and warnings (ids only grow).
  const lastAlert = useRef(0);
  useEffect(() => {
    for (const { id, channel, game } of alerts) {
      if (id <= lastAlert.current) continue;
      lastAlert.current = id;
      if (!wanted('live')) continue;
      void show({
        kind: 'live',
        id,
        login: channel.login,
        displayName: channel.displayName,
        imageUrl: channel.profileImageUrl ?? undefined,
        game,
      });
    }
  }, [alerts]);

  const lastWarning = useRef(0);
  useEffect(() => {
    for (const warning of warnings) {
      if (warning.id <= lastWarning.current) continue;
      lastWarning.current = warning.id;
      if (!wanted('warning')) continue;
      const { title, detail, page } = warningText(warning);
      void show({
        kind: 'warning',
        id: warning.id,
        battery: warning.kind === 'battery',
        title,
        detail,
        page,
        culprit: warning.kind === 'load' ? warning.load.apps.find((a) => a.closable) : undefined,
      });
    }
  }, [warnings]);

  // Answers from the popout window and the icon in the notification area. Pause and next track
  // change the mix's state (above); a jump does not, so its new position is sent here.
  useEffect(() => {
    if (!hasPopouts) return;
    let info = 0;
    const stops = [
      onPopoutDone(({ kind, id }) => {
        if (kind === 'live') latest.current.dismissAlert(id);
        if (kind === 'warning') latest.current.dismissWarning(id);
      }),
      onOpenPage((page) => latest.current.openPage(page)),
      onMixControl(({ action, position }) => {
        const own = latest.current.mix;
        if (action === 'toggle') own.toggle();
        if (action === 'next') own.next();
        if (action === 'seek' && position !== null) {
          own.seek(position);
          void mixItem(position).then((item) => item && updatePopout(item));
        }
      }),
      // Asked for by a click: what plays now, whatever the popout settings say.
      onTrayMusic(() => {
        void (async () => {
          const own = await mixItem();
          if (own) return void show(own, true);
          if (await readMedia?.().catch(() => null))
            return void show({ kind: 'music', id: ++info }, true);
          void show(
            {
              kind: 'info',
              id: ++info,
              title: 'Gerade läuft nichts',
              detail: 'Musik in einer App oder im Mix starten',
            },
            true,
          );
        })();
      }),
    ];
    return () => stops.forEach((stop) => stop());
  }, []);
}
