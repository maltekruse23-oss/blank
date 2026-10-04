'use client';
import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { RankBadge } from '../../board';
import { rankName, type Rank, type Step } from '../../../src/features/aram/aramRating';
type Details = {
    name: string;
    rank: Rank | null;
    games: number;
    history: Step[];
    bestGames: Step[];
    error?: string;
};
const date = (at: number) => new Date(at).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
export default function Player() { const params = useParams<{
    puuid: string;
}>(); const search = useSearchParams(); const group = search.get('group'); const [data, setData] = useState<Details | null>(null); const [error, setError] = useState(''); useEffect(() => { let stop = false, busy = false; let pending = false; const suffix = group ? '?group=' + encodeURIComponent(group) : ''; const refresh = async () => { if (busy) {
    pending = true;
    return;
} busy = true; try {
    const r = await fetch('/api/players/' + encodeURIComponent(params.puuid) + suffix);
    const d = await r.json() as Details;
    if (!r.ok)
        throw Error(d.error);
    if (!stop) {
        setData(d);
        setError('');
    }
}
catch (e) {
    if (!stop)
        setError((e as Error).message);
}
finally {
    busy = false;
    if (pending && !stop) {
        pending = false;
        void refresh();
    }
} }; void refresh(); const es = new EventSource('/api/live' + suffix); es.addEventListener('game', refresh); es.addEventListener('reset', refresh); es.addEventListener('ready', refresh); const timer = setInterval(() => { if (es.readyState !== 1)
    void refresh(); }, 5000); return () => { stop = true; es.close(); clearInterval(timer); }; }, [params.puuid, group]); return <><a href="/" className="back">Zur Rangliste</a>{error && <p role="alert" className="error">{error}</p>}{!data && !error && <p>Spieler wird geladen …</p>}{data && <><div className="heading"><div><span className="eyebrow">SPIELER / WERTUNG V3{group ? ' / GRUPPE' : ''}</span><h1>{data.name}</h1></div></div><div className="player-summary"><RankBadge rank={data.rank} games={data.games}/><span>{data.games} gewertete Spiele</span></div><h2 className="history-title">Dein Verlauf</h2>{data.history.length > 0 ? <><div className="chart" role="img" aria-label="Punktestand je gewertetem Spiel">{data.history.map(h => <div key={h.entry.gameId} title={`${date(h.entry.at)} · ${h.after ? rankName(h.after) + ' · ' + h.after.points + ' MP' : 'Platzierung'} · Note ${h.mark.grade}`} style={{ height: Math.max(4, ((h.after?.ladder ?? 0) / Math.max(100, ...data.history.map(x => x.after?.ladder ?? 0))) * 100) + '%' }}/>)}</div><div className="table-wrap"><table><thead><tr><th>Spiel</th><th>Champion</th><th>Note</th><th>MP</th><th>Rang danach</th></tr></thead><tbody>{[...data.history].reverse().map(h => <tr key={h.entry.gameId}><td>{date(h.entry.at)}<div className="game-note">{h.entry.win ? 'Sieg' : 'Niederlage'}</div></td><td>{h.entry.championName || h.entry.champion || h.entry.championId}<div className="game-note">{h.entry.kills} / {h.entry.deaths} / {h.entry.assists}</div></td><td>{h.mark.grade}</td><td className={h.gain !== null && h.gain < 0 ? 'down' : 'up'}>{h.gain === null ? 'Platzierung' : `${h.gain > 0 ? '+' : ''}${h.gain}`}</td><td>{h.after ? `${rankName(h.after)} · ${h.after.points} MP` : 'Noch offen'}{h.change && <div className="game-note">{{ placed: 'Eingestuft', promoted: 'Aufstieg', demoted: 'Abstieg' }[h.change]}</div>}</td></tr>)}</tbody></table></div></> : <p>Noch keine wertbaren Spiele in dieser Saison.</p>}<h2 className="history-title">Beste Spiele</h2><div className="best">{data.bestGames.map(h => <div key={h.entry.gameId}><b>{h.mark.grade}</b>{h.entry.championName || h.entry.champion}<div className="game-note">{date(h.entry.at)}</div></div>)}</div></>}</>; }
