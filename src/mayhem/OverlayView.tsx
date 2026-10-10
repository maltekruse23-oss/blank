// The overlay over the League game (src-tauri/src/overlay.rs): the window is the game's client area,
// so a card's badge sits by where its name was read (parts of the width and height). It draws only
// what Rust passes on; Rust shows and hides it. Tiers and the fitting build's items only: no win
// rates, no advice (Riot's rules).
import { isTauri } from '@tauri-apps/api/core';
import { useEffect, useState, type CSSProperties } from 'react';
import { onOverlay, overlayNow, type OverlayShown } from '../adapters/overlay';
import { DDRAGON_VERSION } from '../data/proStreamers';

const itemImage = (id: number) =>
  `https://ddragon.leagueoflegends.com/cdn/${DDRAGON_VERSION}/img/item/${id}.png`;

const at = (x: number, y: number) => ({ '--x': x, '--y': y }) as CSSProperties;

/** The browser preview (`mayhem.html?overlay`): invented cards where a 1920 × 1080 game has them. */
const SAMPLE: OverlayShown = {
  build: 'Burn mage',
  cards: [
    { tier: 'S', items: [6653, 4645], x: 0.309, y: 0.37 },
    { tier: 'B', items: [], x: 0.5, y: 0.37 },
    { tier: 'C', items: [3068, 3075], x: 0.691, y: 0.37 },
  ],
};

export function OverlayView() {
  const [shown, setShown] = useState<OverlayShown | null>(isTauri() ? null : SAMPLE);
  useEffect(() => {
    // What came with the event is newer than the answer to the first question.
    let heard = false;
    const stop = onOverlay((next) => {
      heard = true;
      setShown(next);
    });
    void overlayNow().then((now) => !heard && now && setShown(now));
    return stop;
  }, []);
  if (!shown?.cards.length) return null;
  const top = Math.min(...shown.cards.map((c) => c.y));
  return (
    <div className="mayhem-overlay">
      {shown.cards.some((c) => c.tier) && (
        <p className="mayhem-overlay-build" style={at(0.5, top)}>
          Tiers for <b>{shown.build}</b>
        </p>
      )}
      {shown.cards.map((c) => (
        <div key={c.x} className="mayhem-overlay-card" style={at(c.x, c.y)}>
          {c.tier && (
            <span className="mayhem-aug-row-tier" data-tier={c.tier}>
              {c.tier}
            </span>
          )}
          {c.items.length > 0 && (
            <span className="mayhem-overlay-fit">
              {c.items.map((id) => (
                <img key={id} src={itemImage(id)} alt="" />
              ))}
            </span>
          )}
        </div>
      ))}
      {!isTauri() && <span className="mayhem-pill mock mayhem-overlay-mock">Mock</span>}
    </div>
  );
}
