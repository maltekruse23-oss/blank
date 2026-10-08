// The Mayhem app's records (user's wish 08.10.2026, records.ts). Its question: who holds the
// records? On top the players with the most records, then one card per category in the website's
// order (the first six, the rest behind "Show more"): the record holder with champion and value
// big, places 2 and 3 small, the rest behind "Show more", the player's own place marked
// ("You: #7"). One accent: only a record the player holds glows. All time or this season. English
// only, "–" for what is missing (MAYHEM-DESIGN.md "Übersicht vor Vollständigkeit").
import { useEffect, useMemo, useState } from 'react';
import { Crown } from 'lucide-react';
import { championSquare } from '../adapters/aram';
import { games } from './format';
import { ago, type MeState } from './me';
import { PageHead, step } from './pages';
import {
  crowns,
  loadRecords,
  recordValue,
  type RecordCard,
  type RecordPlace,
  type RecordsState,
} from './records';
import type { TierChampion } from './tiers';
import { More, Tabs } from './ui';

type Scope = 'all' | 'season';
const SCOPES: { id: Scope; label: string }[] = [
  { id: 'all', label: 'All time' },
  { id: 'season', label: 'This season' },
];
/** Places shown under "Most records" (a tie shows everyone on the place). */
const CROWNS = 3;
/** Category cards before "Show more": two rows at 1280 px (three columns). */
const FIRST_CARDS = 6;

type Champions = Map<number, TierChampion>;

/** "Name" bold and "#TAG" small. */
function Riot({ name }: { name: string }) {
  const at = name.lastIndexOf('#');
  return at > 0 ? (
    <>
      <b>{name.slice(0, at)}</b>
      <small>{name.slice(at)}</small>
    </>
  ) : (
    <b>{name}</b>
  );
}

const championOf = (p: RecordPlace, champions: Champions) => {
  const known = champions.get(p.championId);
  return { alias: known?.alias ?? p.champion, name: known?.name ?? p.championName };
};

/** The champion (when known) and when; for a total the last game that added to it. */
const gameLine = (card: RecordCard, p: RecordPlace, champions: Champions) => {
  const { name } = championOf(p, champions);
  const when = ago(p.at, Date.now());
  return name ? `${card.total ? 'Last with ' : ''}${name} · ${when}` : when;
};

function Face({ p, champions, size }: { p: RecordPlace; champions: Champions; size: number }) {
  const { alias, name } = championOf(p, champions);
  const src = alias ? championSquare(alias) : null;
  return src ? (
    <img className="mayhem-meta-face" src={src} alt={name ?? ''} width={size} height={size} />
  ) : (
    <span className="mayhem-meta-face" style={{ width: size, height: size }} />
  );
}

function Card({
  card,
  index,
  siteId,
  champions,
}: {
  card: RecordCard;
  index: number;
  siteId: string | null;
  champions: Champions;
}) {
  const [top, ...rest] = card.places;
  const mine = card.places.find((p) => p.id === siteId);
  return (
    <li
      className="mayhem-rec-card mayhem-in"
      data-mine={mine?.place === 1}
      style={step(index + 3)}
      aria-labelledby={`record-${card.id}`}
    >
      <header>
        <div>
          <h2 id={`record-${card.id}`}>{card.title}</h2>
          <small>{card.note}</small>
        </div>
        {mine && <span className="mayhem-pill gold">You: #{mine.place}</span>}
      </header>
      <div className="mayhem-rec-holder" data-me={top!.id === siteId}>
        <Face p={top!} champions={champions} size={56} />
        <div>
          <span className="mayhem-rec-name">
            <Crown size={15} aria-label="Place 1" />
            <Riot name={top!.name} />
          </span>
          <strong>{recordValue(card, top!.value)}</strong>
          <small>
            {gameLine(card, top!, champions)}
            {rest[0]?.place === 1 && ' · Tie'}
          </small>
        </div>
      </div>
      {rest.length > 0 && (
        <More
          list={rest}
          first={2}
          className="mayhem-rec-list"
          keep={(p) => p.id === siteId}
          render={(p) => (
            <li
              key={p.id}
              data-place={p.place}
              data-me={p.id === siteId}
              title={gameLine(card, p, champions)}
            >
              <b className="mayhem-place">{p.place}</b>
              <Face p={p} champions={champions} size={26} />
              <span className="mayhem-rec-name">
                <Riot name={p.name} />
              </span>
              <span className="mayhem-rec-value">{recordValue(card, p.value)}</span>
            </li>
          )}
        />
      )}
    </li>
  );
}

/** Who holds the records? mayhemstats.lol's best ten per category (records.ts). */
export function RecordsPage({ me, champions }: { me: MeState; champions: TierChampion[] }) {
  const [scope, setScope] = useState<Scope>('all');
  const [got, setGot] = useState<RecordsState>({ state: 'loading' });
  const [ask, setAsk] = useState(0);
  useEffect(() => {
    let current = true;
    setGot({ state: 'loading' });
    void loadRecords(scope === 'season').then((next) => current && setGot(next));
    return () => {
      current = false;
    };
  }, [scope, ask]);
  const byId = useMemo(() => new Map(champions.map((c) => [c.id, c])), [champions]);
  const siteId = me.state === 'ready' ? me.siteId : null;
  const records = got.state === 'ready' ? got.records : null;
  const cards = records?.cards.filter((c) => c.places.length) ?? [];
  const leaders = records
    ? crowns(records.cards).filter((p) => p.place <= CROWNS || p.id === siteId)
    : [];
  return (
    <div className="mayhem-page">
      <PageHead
        title="Records"
        line={
          records
            ? `Who holds the records? ${games(records.games)} on mayhemstats.lol, ${scope === 'season' ? records.season : 'all time'}.`
            : 'Who holds the records? From mayhemstats.lol.'
        }
        badge={got.state === 'ready' && got.mock ? 'Mock' : undefined}
      />
      <div className="mayhem-tools mayhem-in" style={step(1)}>
        <Tabs tabs={SCOPES} value={scope} onChange={setScope} label="Time" />
      </div>
      {got.state === 'loading' ? (
        <p className="mayhem-note mayhem-in">Loading the records from mayhemstats.lol …</p>
      ) : got.state === 'failed' ? (
        <div className="mayhem-glow mayhem-in mayhem-narrow">
          <p>
            {got.offline
              ? "You're offline. Connect to the internet and try again."
              : 'The records did not arrive from mayhemstats.lol.'}
          </p>
          <button type="button" className="mayhem-button" onClick={() => setAsk(ask + 1)}>
            Try again
          </button>
        </div>
      ) : !cards.length ? (
        <p className="mayhem-note mayhem-in">
          {scope === 'season' ? 'No records this season yet.' : 'No records yet.'}
        </p>
      ) : (
        <>
          <section className="mayhem-crowns mayhem-in" style={step(2)} aria-label="Most records">
            <span className="mayhem-kicker">Most records</span>
            <ol>
              {leaders.map((p) => (
                <li key={p.id} data-place={p.place} data-me={p.id === siteId}>
                  <Crown size={18} aria-hidden />
                  <span className="mayhem-rec-name">
                    <Riot name={p.name} />
                  </span>
                  <span className="mayhem-rec-value">
                    {p.crowns} {p.crowns === 1 ? 'record' : 'records'}
                  </span>
                </li>
              ))}
            </ol>
          </section>
          <More
            list={cards}
            first={FIRST_CARDS}
            className="mayhem-rec-grid"
            render={(card, i) => (
              <Card key={card.id} card={card} index={i} siteId={siteId} champions={byId} />
            )}
          />
        </>
      )}
    </div>
  );
}
