// The pick screen of ARAM Mayhem's card phase (user's decision 09.10.2026, like Blitz): the client
// deals 2–3 champions, the app shows them as big cards with their tier and win rate from arammeta's
// champion list, and a click picks that champion in the client (aram_live.rs). Only on a click,
// nothing preselected, never automatic.
import { useState } from 'react';
import { championSplash, championSquare } from '../adapters/aram';
import { pickChampion, type HeldChamp } from '../adapters/aramChamp';
import { percent, winsIn } from './format';
import { PageHead, step } from './pages';
import type { TierChampion } from './tiers';

type CardState = 'picking' | 'picked' | 'failed' | 'example';

/** Fixed English words; Rust writes the client's real reason to the error log. */
const SAID: Record<CardState, string> = {
  picking: 'Picking …',
  picked: 'Picked.',
  failed: 'Could not pick. Pick it in the client.',
  example: 'Mock: nothing is sent in the preview.',
};

export function PickView({
  offered,
  champions,
  sample,
}: {
  offered: HeldChamp[];
  champions: TierChampion[];
  sample: boolean;
}) {
  const [states, setStates] = useState<Record<number, CardState>>({});
  // Only while a pick is on its way: "Picked." was never seen live, a second click stays possible
  // (Rust refuses it once the client took the pick).
  const busy = Object.values(states).some((s) => s === 'picking');
  const pick = (id: number) => {
    if (sample) return setStates({ [id]: 'example' });
    setStates({ [id]: 'picking' });
    void pickChampion(id).then((ok) => setStates({ [id]: ok === true ? 'picked' : 'failed' }));
  };
  return (
    <div className="mayhem-page">
      <PageHead
        title="Pick your champion"
        line="Click a card to pick it in the client."
        badge={sample ? 'Mock' : undefined}
      />
      <ul className="mayhem-pick-cards">
        {offered.map((c, i) => (
          <PickCard
            key={c.championId}
            champ={c}
            entry={champions.find((e) => e.id === c.championId)}
            index={i + 1}
            state={states[c.championId]}
            busy={busy}
            onPick={() => pick(c.championId)}
          />
        ))}
      </ul>
    </div>
  );
}

function PickCard({
  champ,
  entry,
  index,
  state,
  busy,
  onPick,
}: {
  champ: HeldChamp;
  entry: TierChampion | undefined;
  index: number;
  state: CardState | undefined;
  busy: boolean;
  onPick: () => void;
}) {
  const alias = champ.alias || entry?.alias || '';
  const name = entry?.name || champ.name || alias || `Champion ${champ.championId}`;
  // The splash, else the square picture, else just the card.
  const pictures = [championSplash(alias), championSquare(alias)].filter(Boolean) as string[];
  const [picture, setPicture] = useState(0);
  return (
    <li className="mayhem-in" style={step(index)}>
      <button
        type="button"
        className="mayhem-pick-card"
        data-state={state}
        disabled={busy}
        aria-busy={state === 'picking'}
        title={entry ? `${name}: ${winsIn(entry.winRate, entry.games)}` : `${name}: no numbers yet`}
        onClick={onPick}
      >
        {pictures[picture] && (
          <img
            className="mayhem-pick-splash"
            data-square={picture > 0 || undefined}
            src={pictures[picture]}
            alt=""
            onError={() => setPicture(picture + 1)}
          />
        )}
        {entry && (
          <span className="mayhem-aug-card-tier" data-tier={entry.tier}>
            <span className="mayhem-hidden">Tier </span>
            {entry.tier}
          </span>
        )}
        <span className="mayhem-pick-text">
          <b>{name}</b>
          <span className="mayhem-pick-rate">
            {entry ? percent(entry.winRate) : '–'}
            <small> win rate</small>
          </span>
        </span>
      </button>
      <p className="mayhem-note mayhem-pick-state" role="status">
        {state && SAID[state]}
      </p>
    </li>
  );
}
