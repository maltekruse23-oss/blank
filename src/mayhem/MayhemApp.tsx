import { useEffect, useRef, useState } from 'react';
import {
  leagueClientOpen,
  onChamp,
  onLeagueClient,
  readChampInfo,
  watchChamp,
  type HeldChamp,
} from '../adapters/aramChamp';
import { champView, SAMPLE_CHAMP, type ChampView } from '../features/aram/champCard';
import { MayhemCard } from './MayhemCard';

/** Swaps and rerolls come in quick turns: the card waits for the pick to settle this long. */
const SETTLE_MS = 600;

type Shown =
  | { state: 'none' }
  | { state: 'loading'; champ: HeldChamp }
  | { state: 'failed'; champ: HeldChamp; sample: boolean }
  | { state: 'ready'; view: ChampView; sample: boolean };

/**
 * The Mayhem app (src-tauri/src/mayhem.rs, user's wish: "ganz schlicht", the card "direkt in der
 * App"): one window with the Champ-Karte of the champion held in an ARAM Mayhem champion select.
 * The card stays after the select, so its augment tiers can be looked up during the game, until
 * the next champion.
 */
export function MayhemApp() {
  const [client, setClient] = useState<boolean | null>(null);
  const [shown, setShown] = useState<Shown>({ state: 'none' });
  const asked = useRef(0);

  const show = (champ: HeldChamp, sample: boolean) => {
    const ask = ++asked.current;
    setShown({ state: 'loading', champ });
    readChampInfo(champ.championId).then(
      (info) => {
        if (ask !== asked.current) return;
        const view = champView(champ, info);
        setShown(view ? { state: 'ready', view, sample } : { state: 'failed', champ, sample });
      },
      () => ask === asked.current && setShown({ state: 'failed', champ, sample }),
    );
  };
  const showRef = useRef(show);
  showRef.current = show;

  useEffect(() => {
    void leagueClientOpen().then(setClient);
    const stopClient = onLeagueClient(setClient);
    void watchChamp(true);
    let timer = 0;
    const stopChamp = onChamp((champ) => {
      window.clearTimeout(timer);
      if (champ.championId <= 0) return;
      timer = window.setTimeout(() => showRef.current(champ, false), SETTLE_MS);
    });
    return () => {
      window.clearTimeout(timer);
      stopChamp();
      stopClient();
      void watchChamp(false);
    };
  }, []);

  return (
    <div className="mayhem">
      <header className="mayhem-top">
        <span className="mayhem-brand">Mayhem</span>
        <span className="mayhem-status" data-open={client === true}>
          {client === null ? '' : client ? 'League-Client offen' : 'League-Client zu'}
        </span>
      </header>
      <main className="mayhem-main">
        {shown.state === 'ready' ? (
          <MayhemCard
            key={`${shown.view.championId}-${shown.sample}`}
            view={shown.view}
            sample={shown.sample}
            onClose={shown.sample ? () => setShown({ state: 'none' }) : undefined}
          />
        ) : shown.state === 'loading' ? (
          <p className="mayhem-note mayhem-in">Lade {shown.champ.name || shown.champ.alias} …</p>
        ) : shown.state === 'failed' ? (
          <div className="mayhem-wait">
            <div className="mayhem-glow mayhem-in">
              <p>Die Werte kamen nicht an. Prüfe die Verbindung.</p>
              <button
                type="button"
                className="mayhem-button"
                onClick={() => show(shown.champ, shown.sample)}
              >
                Nochmal
              </button>
            </div>
          </div>
        ) : (
          <div className="mayhem-wait">
            <div className="mayhem-glow mayhem-in">
              <h1>{client ? 'Warte auf die Champ-Auswahl' : 'Starte League'}</h1>
              <p>Hier steht dein Build, sobald du in ARAM Mayhem einen Champion hast.</p>
              <button
                type="button"
                className="mayhem-button primary"
                onClick={() => show(SAMPLE_CHAMP, true)}
              >
                Beispiel: {SAMPLE_CHAMP.name}
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
