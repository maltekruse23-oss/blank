import { useEffect, useRef } from 'react';
import { onChamp, readChampInfo, watchChamp, type HeldChamp } from '../../adapters/aramChamp';
import { hasPopouts, showPopout } from '../../platform/popout';
import type { Preferences } from '../settings/preferences';
import { champView } from './champCard';

/** Swaps and rerolls come in quick turns: the card waits for the pick to settle this long. */
const SETTLE_MS = 1_200;

let serial = 0;

/** Champion of "Testen" in the settings (the user's own example: AP-Alistar). */
export const SAMPLE_CHAMP: HeldChamp = { championId: 12, alias: 'Alistar', name: 'Alistar' };

/**
 * Reads the champion's numbers from the website and shows the card. `current` says whether the
 * pick is still the latest when the answer comes. Resolves to whether a card was shown; throws
 * when the website or Data Dragon did not answer.
 */
export async function showChampCard(
  champ: HeldChamp,
  p: Preferences,
  current: () => boolean = () => true,
) {
  const info = await readChampInfo(champ.championId);
  const view = champView(champ, info);
  if (!view || !current()) return false;
  return showPopout(
    { kind: 'champ', id: ++serial, view },
    {
      overFullScreen: p.popoutFullscreen,
      acrylic: p.popoutAcrylic && !p.popoutTaskbar,
      screen: p.popoutScreen,
    },
  );
}

/**
 * Champ-Karte (user's wish): in an ARAM Mayhem champion select, a popout with the best augments
 * and builds for the champion the user holds (src-tauri/src/aram_live.rs tells which), again after
 * every swap or reroll. Only with the setting on, with popouts on and not "Nicht stören", and while
 * blank. is not in front (in the champion select the League client is); like every popout it is
 * held back over a full-screen game on its screen.
 */
export function useChampCard(preferences: Preferences) {
  const latest = useRef(preferences);
  latest.current = preferences;
  const wanted = hasPopouts && preferences.popouts && preferences.popoutChamp;

  useEffect(() => {
    if (!wanted) return;
    void watchChamp(true);
    let timer = 0;
    let asked = 0;
    const stop = onChamp((champ) => {
      window.clearTimeout(timer);
      const ask = ++asked;
      if (champ.championId <= 0) return;
      timer = window.setTimeout(() => {
        void (async () => {
          const p = latest.current;
          if (p.quiet || (!p.popoutInFront && document.hasFocus())) return;
          await showChampCard(champ, p, () => ask === asked).catch(() => false);
        })();
      }, SETTLE_MS);
    });
    return () => {
      window.clearTimeout(timer);
      stop();
      void watchChamp(false);
    };
  }, [wanted]);
}
