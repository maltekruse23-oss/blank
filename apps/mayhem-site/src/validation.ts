import { z } from 'zod';
import { MAX_PER_UPLOAD, RARITIES, validName } from './augments';
const n = (max = 100000000) => z.number().int().min(0).max(max);
const plain = (max = 40) => z.string().refine(s => [...s].length <= max && !/[\u0000-\u001f\u007f-\u009f]/u.test(s), 'Text zu lang oder mit Steuerzeichen');
export const puuid = z.string().regex(/^[A-Za-z0-9_-]{36,100}$/);
const alias = z.string().max(40).regex(/^[A-Za-z0-9]*$/);
const combat = { kills: n(1000), deaths: n(1000), assists: n(1000), damage: n(), taken: n(), healed: n(), shielded: n(), gold: n() };
const seat = z.object({ ...combat, you: z.boolean().optional(), team: n(1000), championId: n(100000), mitigated: n() }).strict();
export const entrySchema = z.object({ gameId: z.number().int().min(1).lt(10000000000000), at: z.number().int().min(1577836800000).refine(v => v <= Date.now() + 86400000, 'Startzeit liegt zu weit in der Zukunft'), seconds: n(14400), patch: z.string().max(10).regex(/^[0-9.]*$/), puuid, name: plain().refine(s => s.length > 0), championId: n(100000), champion: alias, championName: plain(), win: z.boolean(), ...combat, level: n(30), items: z.array(n(1000000)).max(7), augments: z.array(n(1000000)).max(8), damageRank: z.number().int().min(1).max(10), teamShare: z.number().finite().min(0).max(1), multikill: n(5), pentas: n(100), details: z.object({ magic: n(), physical: n(), trueDamage: n(), mitigated: n(), doubles: n(1000), triples: n(1000), quadras: n(1000), largestCrit: n(1000000), ccSeconds: n(100000), largestSpree: n(1000), turretDamage: n() }).strict().nullable(), with: z.array(z.object({ puuid, name: plain(), champion: alias, championName: plain(), damage: n(), kills: n(1000), deaths: n(1000), assists: n(1000), sameTeam: z.boolean() }).strict()).max(10), provisional: z.boolean().optional(), skin: n(999).optional(), lobby: z.array(seat).max(10).refine(a => a.length === 0 || a.filter(s => s.you).length === 1, 'Lobby braucht genau ein you').optional() }).strict().superRefine((e, c) => { const s = e.lobby?.find(s => s.you); if (s && (['championId', 'kills', 'deaths', 'assists', 'damage', 'taken', 'healed', 'shielded', 'gold'] as const).some(k => s[k] !== e[k]))
    c.addIssue({ code: 'custom', message: 'Eigene Lobby-Werte stimmen nicht mit dem Eintrag überein' }); });
// `group` is left over from the removed groups: older blank. versions still send null; it is ignored.
export const uploadSchema = z.object({ entries: z.array(entrySchema).min(1).max(100), player: z.object({ puuid, name: plain().refine(s => s.length > 0), icon: n(1000000) }).strict(), group: z.string().regex(/^[A-Za-z0-9]{12}$/).nullable().optional() }).strict().superRefine((b, c) => { const keys = b.entries.map(e => `${e.gameId}/${e.puuid}`); if (new Set(keys).size !== keys.length)
    c.addIssue({ code: 'custom', message: 'Doppelter Spielerschlüssel im Upload' }); });
export const hideSchema = z.object({ gameId: z.number().int().min(1).lt(10000000000000), name: plain().refine(s => s.trim().length > 0) }).strict();
export function quality(e: z.infer<typeof entrySchema>) { return (e.provisional ? 1 : !e.details ? 2 : e.lobby?.length ? 4 : 3) + (e.skin !== undefined ? .5 : 0); }
export function canonical(v: unknown): string { if (Array.isArray(v))
    return '[' + v.map(canonical).join(',') + ']'; if (v && typeof v === 'object')
    return '{' + Object.entries(v).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([k, v]) => JSON.stringify(k) + ':' + canonical(v)).join(',') + '}'; return JSON.stringify(v); }
export function lobbyCanonical(e: z.infer<typeof entrySchema>) { return canonical((e.lobby ?? []).map(({ you, ...s }) => canonical(s)).sort()); }
// Augments from blank. (POST /api/augments); the icon is checked in the handler (iconOf).
export const augmentUploadSchema = z.object({ puuid, augments: z.array(z.object({ id: z.number().int().min(1).max(1000000), name: z.string().refine(validName, 'Ungültiger Name'), rarity: z.enum(RARITIES), icon: z.string().max(40000).nullable() }).strict()).min(1).max(MAX_PER_UPLOAD) }).strict().superRefine((b, c) => { if (new Set(b.augments.map(a => a.id)).size !== b.augments.length)
    c.addIssue({ code: 'custom', message: 'Doppeltes Augment im Upload' }); });
