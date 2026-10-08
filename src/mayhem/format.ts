// The Mayhem app is English only (user's choice 08.10.2026): numbers like 1,948 and 57%.
import { number as numberIn, percent as percentIn } from '../features/aram/format';

export const number = (value: number) => numberIn(value, 'en');
export const percent = (share: number) => percentIn(share, 'en');
export const games = (n: number) => `${number(n)} ${n === 1 ? 'game' : 'games'}`;
/** A win rate's tooltip: the games behind it stay reachable (MAYHEM-DESIGN.md "Ehrlich"). */
export const winsIn = (winRate: number, n: number) => `${percent(winRate)} wins in ${games(n)}`;
