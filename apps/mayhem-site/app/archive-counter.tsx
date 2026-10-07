'use client';
import { useEffect, useState } from 'react';
import { useLang } from './ui/i18n';

export default function ArchiveCounter() {
    const { t, href, num } = useLang();
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
        {t('Raw data archive', 'Rohdatenarchiv')}: <strong>{count(stats?.matches)}</strong> {t('unique matches', 'eindeutige Matches')},
        {' '}{count(stats?.players)} {t('players', 'Spieler')},
        {' '}{count(stats?.timelines)} Timelines.
        {unavailable && t(' Updates not available right now.', ' Aktualisierung gerade nicht verfügbar.')}
    </p><p className="fine">{t('Every extra game makes win rates, the tier list and builds more accurate.', 'Jedes Spiel mehr macht Siegquoten, Tier-Liste und Builds genauer.')}{' '}
        <a href={href('/join')}>{t('Get the Collector and join', 'Collector laden und mitmachen')}</a>
    </p></>;
}
