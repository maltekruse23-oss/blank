import { useState } from 'react';
import { Check, Copy, LogOut, RotateCcw, Users } from 'lucide-react';
import { profileIcon, splitRiotId, type AramPlayer } from '../../adapters/aram';
import { MAX_MEMBERS } from '../../adapters/aramGroup';
import { ChannelAvatar } from '../../components/ui';
import { day } from './format';
import type { AramGroupHook } from './useAramGroup';

function Member({ player, me }: { player: AramPlayer; me: boolean }) {
  const { name, tag } = splitRiotId(player.name);
  return (
    <li className="aram-person">
      <ChannelAvatar login={name} imageUrl={profileIcon(player.icon)} />
      <span className="aram-person-name">
        <b>{name}</b>
        {tag && <small>#{tag}</small>}
      </span>
      {me && <span className="aram-you">Du</span>}
    </li>
  );
}

/** The code to pass on, with a copy button. */
function GroupCode({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="aram-group-code">
      <code>{code}</code>
      <button
        className="icon-button"
        aria-label="Code kopieren"
        title="Code kopieren"
        onClick={() =>
          void navigator.clipboard.writeText(code).then(
            () => {
              setCopied(true);
              window.setTimeout(() => setCopied(false), 2000);
            },
            () => undefined,
          )
        }
      >
        {copied ? <Check size={15} /> : <Copy size={15} />}
      </button>
    </div>
  );
}

/**
 * The group of the leaderboard (user's wish: the same for every friend): its members, its code,
 * a restart for everyone and leaving. Without a group: create one or join with a code.
 */
export function AramGroupCard({ group, meId }: { group: AramGroupHook; meId: string | null }) {
  const [typed, setTyped] = useState('');
  const [joinNote, setJoinNote] = useState<string | null>(null);
  const [asking, setAsking] = useState<'restart' | 'leave' | null>(null);
  const view = group.view;

  if (!group.available)
    return (
      <section className="card aram-group">
        <header className="card-header">
          <h2>Gruppe</h2>
        </header>
        <p className="aram-note">Gruppen gibt es nur in der Desktop-App.</p>
      </section>
    );

  if (!view)
    return (
      <section className="card aram-group">
        <header className="card-header">
          <h2>Gruppe</h2>
        </header>
        <p className="aram-group-lead">
          <Users size={15} /> Bei allen dieselbe Rangliste
        </p>
        <button className="primary-button" onClick={group.create}>
          Gruppe erstellen
        </button>
        <form
          className="aram-group-join"
          onSubmit={(event) => {
            event.preventDefault();
            const result = group.join(typed);
            setJoinNote(
              result === 'typo'
                ? 'Der Code passt nicht – bitte prüfen.'
                : result === 'incomplete'
                  ? 'Der Code ist noch nicht vollständig.'
                  : null,
            );
          }}
        >
          <input
            value={typed}
            placeholder="Code, z. B. 7F3K-9QDX-WDM4"
            aria-label="Code der Gruppe"
            maxLength={20}
            onChange={(event) => {
              setTyped(event.target.value);
              setJoinNote(null);
            }}
          />
          <button className="secondary-button" type="submit" disabled={!typed.trim()}>
            Beitreten
          </button>
        </form>
        {joinNote && (
          <p className="aram-note" role="status">
            {joinNote}
          </p>
        )}
      </section>
    );

  const connected = view.links.hivemq || view.links.mosquitto;
  return (
    <section className="card aram-group in-group">
      <header className="card-header">
        <h2>Gruppe</h2>
        <span
          className={`aram-group-link ${connected ? 'up' : ''}`}
          title={connected ? 'Verbunden' : 'Verbindet …'}
        >
          {connected ? 'verbunden' : 'verbindet …'}
        </span>
        <span className="card-note">
          {view.members.length} von {MAX_MEMBERS}
        </span>
      </header>
      <GroupCode code={view.code} />
      <ul className="aram-people">
        {view.members.map((member) => (
          <Member key={member.puuid} player={member} me={member.puuid === meId} />
        ))}
      </ul>
      {view.meUnknown && (
        <p className="aram-note">Öffne einmal den League-Client – dann stehst du in der Gruppe.</p>
      )}
      <div className="aram-reset">
        {asking === 'restart' ? (
          <>
            <p>Die Rangliste für alle in der Gruppe ab jetzt neu zählen?</p>
            <button
              className="secondary-button danger"
              onClick={() => void group.restart().then(() => setAsking(null))}
            >
              <RotateCcw size={14} /> Für alle neu starten
            </button>
            <button className="text-link" onClick={() => setAsking(null)}>
              Abbrechen
            </button>
          </>
        ) : asking === 'leave' ? (
          <>
            <p>Die Gruppe verlassen? Mit dem Code kannst du wieder beitreten.</p>
            <button className="secondary-button danger" onClick={() => void group.leave()}>
              <LogOut size={14} /> Verlassen
            </button>
            <button className="text-link" onClick={() => setAsking(null)}>
              Abbrechen
            </button>
          </>
        ) : (
          <>
            <span>{view.since ? `Zählt seit ${day(view.since)}` : 'Zählt alle Spiele'}</span>
            <button className="text-link" onClick={() => setAsking('restart')}>
              Neu starten
            </button>
            <button className="text-link" onClick={() => setAsking('leave')}>
              Verlassen
            </button>
          </>
        )}
      </div>
    </section>
  );
}
