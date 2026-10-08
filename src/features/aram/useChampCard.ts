import { useEffect, useRef } from 'react';
import {
  chooseBuild,
  onChamp,
  onOffers,
  readChampInfo,
  watchChamp,
  type HeldChamp,
  type Offers,
} from '../../adapters/aramChamp';
import { hasPopouts, showPopout, updatePopout, type PopoutItem } from '../../platform/popout';
import type { Preferences } from '../settings/preferences';
import { champView, itemSetOf, type ChampView } from './champCard';

export { SAMPLE_CHAMP } from './champCard';

/** Swaps and rerolls come in quick turns: the card waits for the pick to settle this long. */
const SETTLE_MS = 1_200;

let serial = 0;

function showView(view: ChampView, p: Preferences, id = ++serial) {
  return showPopout(
    { kind: 'champ', id, view },
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

/** Popouts may show now (not "Nicht stören", blank. not in front unless allowed). */
const mayShow = (p: Preferences) =>
  p.popouts && !p.quiet && (p.popoutInFront || !document.hasFocus());

/**
 * Champ-Karte (user's wish): in an ARAM Mayhem champion select, a popout with the best augments
 * and builds for the champion the user holds (src-tauri/src/aram_live.rs tells which), again after
 * every swap or reroll. Only with the setting on, with popouts on and not "Nicht stören", and while
 * blank. is not in front (in the champion select the League client is); like every popout it is
 * held back over a full-screen game on its screen. The preselected build is told to Rust (and a
 * click on another direction on the card): with "Item-Set schreiben" it goes into the client as
 * item set, with "Augments im Spiel" the offers read in the game come as the same card with their
 * tiers for that build (a reroll replaces them in place). "Beschwörerzauber setzen" is Rust's.
 */
export function useChampCard(preferences: Preferences) {
  const latest = useRef(preferences);
  latest.current = preferences;
  const card = preferences.popouts && preferences.popoutChamp;
  const itemSet = preferences.champItemSet;
  const spells = preferences.champSpells;
  const offers = preferences.champOffers;
  const wanted = hasPopouts && (card || itemSet || spells || offers);

  useEffect(() => {
    if (!wanted) return;
    void watchChamp(true, { itemSet, spells, offers });
    let timer = 0;
    let asked = 0;
    // The card of the champion picked last, for the offers in the game.
    let held: ChampView | null = null;
    const stopChamp = onChamp((champ) => {
      window.clearTimeout(timer);
      const ask = ++asked;
      if (champ.championId <= 0) return;
      timer = window.setTimeout(() => {
        void (async () => {
          const p = latest.current;
          const popout = card && mayShow(p);
          if (!popout && !itemSet && !offers) return;
          const info = await readChampInfo(champ.championId).catch(() => null);
          const view = info && champView(champ, info);
          if (!view || ask !== asked) return;
          held = view;
          const plan = view.plans[0];
          if (plan) void chooseBuild(view.championId, plan.direction, itemSetOf(plan));
          if (popout) await showView(view, p).catch(() => false);
        })();
      }, SETTLE_MS);
    });
    // The card of the offer open now (a reroll updates it in place).
    let shown: PopoutItem | null = null;
    const show = async (event: Offers) => {
      if (!event.offers.length) {
        shown = null;
        return;
      }
      if (held?.championId !== event.championId && event.championId > 0) {
        const champ = { championId: event.championId, alias: '', name: '' };
        const info = await readChampInfo(event.championId).catch(() => null);
        held = info && champView(champ, info);
      }
      const p = latest.current;
      if (!held || !mayShow(p)) return;
      const view = { ...held, offer: { direction: event.direction, augments: event.offers } };
      if (shown) {
        shown = { kind: 'champ', id: shown.id, view };
        void updatePopout(shown);
      } else {
        shown = { kind: 'champ', id: ++serial, view };
        await showView(view, p, shown.id);
      }
    };
    const stopOffers = offers ? onOffers((event) => void show(event)) : () => undefined;
    return () => {
      window.clearTimeout(timer);
      stopChamp();
      stopOffers();
      void watchChamp(false);
    };
  }, [wanted, card, itemSet, spells, offers]);
}
