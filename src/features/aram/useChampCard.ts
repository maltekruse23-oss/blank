import { useEffect, useRef } from 'react';
import {
  onChamp,
  readChampInfo,
  watchChamp,
  writeItemSet,
  type HeldChamp,
} from '../../adapters/aramChamp';
import { hasPopouts, showPopout } from '../../platform/popout';
import type { Preferences } from '../settings/preferences';
import { champView, itemSetOf, type ChampView } from './champCard';

export { SAMPLE_CHAMP } from './champCard';

/** Swaps and rerolls come in quick turns: the card waits for the pick to settle this long. */
const SETTLE_MS = 1_200;

let serial = 0;

function showView(view: ChampView, p: Preferences) {
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
 * Reads the champion's numbers from the website and shows the card. `current` says whether the
 * pick is still the latest when the answer comes. Resolves to whether a card was shown; throws
 * when the website or Data Dragon did not answer.
 */
export async function showChampCard(
  champ: HeldChamp,
  p: Preferences,
  current: () => boolean = () => true,
) {
  const view = champView(champ, await readChampInfo(champ.championId));
  if (!view || !current()) return false;
  return showView(view, p);
}

/**
 * Champ-Karte (user's wish): in an ARAM Mayhem champion select, a popout with the best augments
 * and builds for the champion the user holds (src-tauri/src/aram_live.rs tells which), again after
 * every swap or reroll. Only with the setting on, with popouts on and not "Nicht stören", and while
 * blank. is not in front (in the champion select the League client is); like every popout it is
 * held back over a full-screen game on its screen. With "Item-Set schreiben" the preselected
 * build goes into the client as item set (also without a card; a click on another direction on
 * the card replaces it), with "Beschwörerzauber setzen" Rust sets the spells by itself.
 */
export function useChampCard(preferences: Preferences) {
  const latest = useRef(preferences);
  latest.current = preferences;
  const card = preferences.popouts && preferences.popoutChamp;
  const itemSet = preferences.champItemSet;
  const spells = preferences.champSpells;
  const wanted = hasPopouts && (card || itemSet || spells);

  useEffect(() => {
    if (!wanted) return;
    void watchChamp(true, { itemSet, spells });
    if (!card && !itemSet) return () => void watchChamp(false);
    let timer = 0;
    let asked = 0;
    const stop = onChamp((champ) => {
      window.clearTimeout(timer);
      const ask = ++asked;
      if (champ.championId <= 0) return;
      timer = window.setTimeout(() => {
        void (async () => {
          const p = latest.current;
          const popout = card && !p.quiet && (p.popoutInFront || !document.hasFocus());
          if (!popout && !itemSet) return;
          const info = await readChampInfo(champ.championId).catch(() => null);
          const view = info && champView(champ, info);
          if (!view || ask !== asked) return;
          const plan = view.plans[0];
          if (itemSet && plan) void writeItemSet(view.championId, plan.direction, itemSetOf(plan));
          if (popout) await showView(view, p).catch(() => false);
        })();
      }, SETTLE_MS);
    });
    return () => {
      window.clearTimeout(timer);
      stop();
      void watchChamp(false);
    };
  }, [wanted, card, itemSet, spells]);
}
