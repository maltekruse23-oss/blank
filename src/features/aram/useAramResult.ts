import { useEffect, useRef, useState } from 'react';
import type {
  AramAdapter,
  AramAugment,
  AramData,
  AramEntry,
  AramPlayer,
} from '../../adapters/aram';
import { hasPopouts, showPopout } from '../../platform/popout';
import type { Preferences } from '../settings/preferences';
import { aramHighlight, type AramHighlight } from './aramHighlight';

export type AramResultView = {
  /** New for every showing, so the card builds up again. */
  id: number;
  entry: AramEntry;
  /** Only the augments of this game, with their icons. */
  augments: Record<string, AramAugment>;
  highlight: AramHighlight;
};

let serial = 0;

/** A game as its card: how special it was, measured against the games before it. */
export function resultView(
  entry: AramEntry,
  data: AramData,
  friends: AramPlayer[],
): AramResultView {
  const players = [
    ...(data.me ? [data.me] : []),
    ...friends.filter((f) => f.puuid !== data.me?.puuid),
  ];
  const augments: Record<string, AramAugment> = {};
  for (const id of entry.augments) {
    const augment = data.augments[String(id)];
    if (augment) augments[String(id)] = augment;
  }
  return { id: ++serial, entry, augments, highlight: aramHighlight(entry, data.games, players) };
}

/**
 * The card after an ARAM Mayhem game (user's wish): when blank. reports the user's result (after
 * the game, src-tauri/src/aram.rs), as a popout while blank. is in the background – with the
 * popout settings, "Nicht stören" and full screen as for every popout – otherwise in the app.
 * Also on request for any game of the collection ("Ansehen").
 */
export function useAramResult(adapter: AramAdapter, preferences: Preferences) {
  const [view, setView] = useState<AramResultView | null>(null);
  const latest = useRef(preferences);
  latest.current = preferences;

  useEffect(
    () =>
      adapter.onResult((played) => {
        void (async () => {
          const data = await adapter.data().catch(() => null);
          const entry = data?.games.find(
            (g) => g.gameId === played.gameId && g.puuid === played.puuid,
          );
          if (!data || !entry) return;
          const p = latest.current;
          const next = resultView(entry, data, p.aramFriends);
          const popout =
            hasPopouts &&
            p.popouts &&
            p.popoutAram &&
            !p.quiet &&
            (p.popoutInFront || !document.hasFocus());
          if (
            popout &&
            (await showPopout(
              { kind: 'aram', ...next },
              { overFullScreen: p.popoutFullscreen, acrylic: p.popoutAcrylic && !p.popoutTaskbar },
            ))
          )
            return;
          // In front, popouts off, "Nicht stören" or held back: in the app, seen on coming back.
          setView(next);
        })();
      }),
    [adapter],
  );

  return { view, show: setView, close: () => setView(null) };
}
