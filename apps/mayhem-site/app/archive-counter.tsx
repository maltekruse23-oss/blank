'use client';
import { useEffect, useState } from 'react';

export default function ArchiveCounter() {
    const [stats, setStats] = useState<{ matches: number; players: number; timelines: number } | null>(null);
    const [unavailable, setUnavailable] = useState(false);
    useEffect(() => {
        const controller = new AbortController(); let busy = false;
        const refresh = async () => {
            if (busy) return;
            busy = true;
            try {
                const response = await fetch('/api/archive/stats', { signal: controller.signal });
                if (!response.ok) throw new Error('unavailable');
                const result = await response.json() as { matches: number; players: number; timelines: number };
                if (![result.matches, result.players, result.timelines].every(n => Number.isSafeInteger(n) && n >= 0)) throw new Error('unavailable');
                if (!controller.signal.aborted) { setStats(result); setUnavailable(false); }
            } catch { if (!controller.signal.aborted) setUnavailable(true); }
            finally { busy = false; }
        };
        void refresh();
        const timer = setInterval(() => void refresh(), 30000);
        return () => { controller.abort(); clearInterval(timer); };
    }, []);
    return <><p className="fine" role="status" aria-live="polite">
        Rohdatenarchiv: <strong>{stats?.matches.toLocaleString('de-DE') ?? '—'}</strong> eindeutige Matches
        {' · '}{stats?.players.toLocaleString('de-DE') ?? '—'} Spieler
        {' · '}{stats?.timelines.toLocaleString('de-DE') ?? '—'} Timelines
        {unavailable && ' · Aktualisierung gerade nicht verfügbar'}
    </p><p className="fine">Jedes Spiel mehr macht Siegquoten, Tier-Liste und Builds genauer.{' '}
        <a href="/mitmachen">Collector laden und mitmachen</a>
    </p></>;
}
