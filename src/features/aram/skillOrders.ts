// Written by server/tools/skill-orders.ts from aramkit.com; do not edit by hand. Empty until aramkit
// allows the use of its data (user's decision 10.10.2026, ROADMAP): the app then shows no skill
// order. With their yes: `node server/tools/skill-orders.ts` fills this file.

export type SkillKey = 'Q' | 'W' | 'E';
/** Which ability is maxed first, second and third, e.g. 'E>Q>W'. */
export type SkillOrder = `${SkillKey}>${SkillKey}>${SkillKey}`;
/** pick: share of the champion's players who max in this order; win: their win rate (both 0-1). */
export type SkillOrderRow = { order: SkillOrder; pick: number; win: number };
export type SkillOrders = { patch: string; date: string; orders: readonly SkillOrderRow[] };

const PATCH = '';
const DATE = '';
/** Per champion ID: the orders at least 5 % of players take, most picked first (at most 3). */
const ORDERS: Readonly<Record<number, readonly SkillOrderRow[]>> = {};

/** The champion's ability max orders on aramkit.com, or undefined without data (then show none). */
export const skillOrderOf = (championId: number): SkillOrders | undefined =>
  ORDERS[championId] && { patch: PATCH, date: DATE, orders: ORDERS[championId] };
