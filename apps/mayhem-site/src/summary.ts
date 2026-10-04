// What the site shows of a standing (leaderboard, profile, start and group pages). Pure, so the
// app's reading of it (src/features/aram/aramSite.ts) is tested against exactly this form.
import { CLIMBING, type standings } from './features/aram/aramRating';

export type Standing = ReturnType<typeof standings>[number];
/** What the site shows of a standing; never the hidden rating (Standing.hidden), only whether the form is above the rank. */
export const open = (s: Standing) => ({ puuid: s.puuid, name: s.name, rank: s.rank, games: s.games, wins: s.wins, placed: s.placed, climbing: s.rank !== null && s.form >= CLIMBING, average: s.average, seasons: s.seasons });
/** The three most played champions of a standing (DDragon key and ID). */
const topChampions = (s: Standing) => { const by = new Map<number, { championId: number; champion: string; games: number }>(); for (const h of s.history) { const c = by.get(h.entry.championId) ?? { championId: h.entry.championId, champion: h.entry.champion, games: 0 }; c.games += 1; by.set(h.entry.championId, c); } return [...by.values()].sort((a, b) => b.games - a.games || a.championId - b.championId).slice(0, 3); };
export const summary = (s: Standing, icon: number | null = null) => ({ ...open(s), icon, champions: topChampions(s), last6: s.history.slice(-6).map(h => ({ gameId: h.entry.gameId, at: h.entry.at, gain: h.gain, grade: h.mark.grade, change: h.change })) });
