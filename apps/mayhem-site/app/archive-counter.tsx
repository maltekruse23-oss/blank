'use client';
import { useEffect, useState } from 'react';
import { num } from './ui/format';

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
    const count = (n: number | undefined) => (n === undefined ? '–' : num(n));
    return <><p className="fine" role="status" aria-live="polite">
        Raw data archive: <strong>{count(stats?.matches)}</strong> unique matches,
        {' '}{count(stats?.players)} players,
        {' '}{count(stats?.timelines)} Timelines.
        {unavailable && ' Updates not available right now.'}
    </p><p className="fine">Every extra game makes win rates, the tier list and builds more accurate.{' '}
        <a href="/join">Get the Collector and join</a>
    </p></>;
}
