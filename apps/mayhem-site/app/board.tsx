'use client';
import './rank-icons.css';
import { useEffect, useState } from 'react';
import ArchiveCounter from './archive-counter';
import { rankName, TIERS, type Rank } from '../src/features/aram/aramRating';
type Player = {
    puuid: string;
    name: string;
    rank: Rank | null;
    games: number;
    last6: {
        gameId: number;
        gain: number | null;
        grade: string;
    }[];
};
export function RankBadge({ rank, games = 0 }: {
    rank: Rank | null;
    games?: number;
}) { return <div className="rank"><img src={'/emblems/' + (rank?.tier.id ?? 'd') + '.png'} alt={rank?.tier.name ?? 'Noch kein Rang'} className={!rank ? 'unranked' : ''}/><div><strong>{rank ? `${rankName(rank)} · ${rank.points} MP` : `Platzierung · ${Math.min(games, 5)}/5`}</strong><div className="progress" aria-label={rank ? `${rank.points} von 100 MP` : 'Platzierung'}><span style={{ width: rank?.division === null ? '100%' : `${rank?.points ?? games * 20}%` }}/></div></div></div>; }
export default function Board() {
    const [group, setGroup] = useState('');
    const [input, setInput] = useState('');
    const [data, setData] = useState<{
        trackedGames: number;
        players: Player[];
        group: {
            name: string;
        } | null;
    } | null>(null);
    const [error, setError] = useState('');
    const [live, setLive] = useState('Verbindung wird aufgebaut');
    useEffect(() => { let stopped = false; let busy = false; let pending = false; const suffix = group ? '?group=' + encodeURIComponent(group) : ''; const refresh = async () => { if (busy) {
        pending = true;
        return;
    } busy = true; try {
        const r = await fetch('/api/leaderboard' + suffix);
        const d = await r.json() as {
            trackedGames: number;
            players: Player[];
            group: {
                name: string;
            } | null;
            error: string;
        };
        if (!r.ok)
            throw Error(d.error);
        if (!stopped) {
            setData(d);
            setError('');
        }
    }
    catch (e) {
        if (!stopped)
            setError((e as Error).message);
    }
    finally {
        busy = false;
        if (pending && !stopped) {
            pending = false;
            void refresh();
        }
    } }; setData(null); void refresh(); const es = new EventSource('/api/live' + suffix); es.addEventListener('ready', () => { setLive('Live · bis zu 2 s'); void refresh(); }); es.addEventListener('game', () => void refresh()); es.addEventListener('reset', () => void refresh()); es.onerror = () => setLive('Aktualisierung alle 5 s'); es.addEventListener('unavailable', () => setLive('Aktualisierung alle 5 s')); const timer = setInterval(() => { if (es.readyState !== EventSource.OPEN)
        void refresh(); }, 5000); return () => { stopped = true; es.close(); clearInterval(timer); }; }, [group]);
    return <><div className="heading"><div><span className="eyebrow">ARAM MAYHEM / QUEUE 2400</span><h1>Die Rangliste<span>.</span></h1></div><span className="live">{live}</span></div><div className="toolbar"><div className="tabs"><button className={!group ? 'active' : ''} onClick={() => { setGroup(''); setInput(''); }}>Global</button><span className={group ? 'active' : ''}>Gruppe</span></div><form onSubmit={e => { e.preventDefault(); if (/^[A-Za-z0-9]{12}$/.test(input))
        setGroup(input);
    else
        setError('Bitte einen Gruppencode mit 12 Zeichen eingeben.'); }}><label className="sr" htmlFor="group">Gruppencode</label><input id="group" placeholder="Gruppencode · 12 Zeichen" value={input} maxLength={12} onChange={e => setInput(e.target.value)} required pattern="[A-Za-z0-9]{12}"/><button type="submit">Anzeigen</button></form></div>
    <p className="fine" role="status" aria-live="polite"><strong>{data?.trackedGames?.toLocaleString('de-DE') ?? '—'}</strong> eindeutige Spiele in der Rangliste</p>
    <ArchiveCounter />
    <div className="board-title"><h2>{group ? (data?.group?.name ?? 'Gruppe') : 'Globale Wertung'}</h2><span>{data?.players.length ?? '—'} Spieler · Wertung v3</span></div>{error && <div role="alert" className="error">{error}</div>}
    <div className="table-wrap"><table><thead><tr><th>Platz</th><th>Spieler</th><th>Rang</th><th>Spiele</th><th>Letzte 6</th></tr></thead><tbody>{data?.players.map((p, i) => <tr key={p.puuid}><td className="place">{String(i + 1).padStart(2, '0')}</td><td><a className="player-link" href={'/players/' + encodeURIComponent(p.puuid) + (group ? '?group=' + group : '')}>{p.name}</a></td><td><RankBadge rank={p.rank} games={p.games}/></td><td>{p.games}</td><td><div className="steps">{p.last6.map(h => <span title={h.gain === null ? 'Platzierungsnote' : `Note ${h.grade}`} className={h.gain === null ? 'neutral' : h.gain > 0 ? 'up' : 'down'} key={h.gameId}>{h.gain === null ? h.grade : `${h.gain > 0 ? '+' : ''}${h.gain}`}</span>)}</div></td></tr>)}</tbody></table>{!data && !error && <div className="empty">Rangliste wird geladen …</div>}{data?.players.length === 0 && <div className="empty"><img src="/emblems/mayhem.png" alt="MAYHEM-Wappen"/><h3>Die ersten Spiele fehlen noch.</h3><p>Sobald blank. ein Spiel übermittelt, erscheint die Wertung hier.<br />Nach fünf gewerteten Spielen steht dein erster Rang fest.</p><a href="/api-guide">App verbinden</a></div>}</div>
    <div className="tier-strip" aria-label="Rangstufen">{TIERS.map(t => <div key={t.id}><img src={'/emblems/' + t.id + '.png'} alt=""/><span>{t.name}</span></div>)}</div><p className="fine">D bis SS: Divisionen IV–I mit je 100 MP. SSS und MAYHEM: offene MP ab der Apex-Linie. Rang nach 5 Einstufungsspielen, höchstens ±30 MP je Spiel; der Sieg zählt nicht, nur die Note. Ungeprüfte Client-Daten; widersprüchliche Spiele zählen nicht.</p></>;
}
