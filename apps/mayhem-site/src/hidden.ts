// Players who asked not to be named (/datenschutz/entfernen). Anyone can ask for a name from a game
// page to disappear: hiding only ever shows less, so it needs no proof of identity. Kept is only the
// PUUID (so a new Riot ID stays hidden too), never the name. Players with a profile upload
// themselves; their names stay, they delete through blank. with their key. Pure, tested in the
// app's repo (src/features/aram/siteHidden.test.ts).
import type { AramEntry } from './adapters/aram';
import { riotId, type RawGame } from './game';

/** Longest accepted input: Riot names have up to 16 characters, tags up to 5. */
export const MAX_RIOT_ID = 40;

/** "  Name  Zwei #euw " → "name zwei#euw": Riot IDs compare without case and outer spaces; null
 * when it is not one name with at most one tag. */
export function riotKey(value: string): string | null {
  if ([...value].length > MAX_RIOT_ID || /[\u0000-\u001f\u007f-\u009f]/u.test(value)) return null;
  const parts = value.split('#');
  if (parts.length > 2) return null;
  const name = parts[0].trim().replace(/\s+/g, ' ').toLowerCase();
  const tag = (parts[1] ?? '').trim().toLowerCase();
  if (!name || (parts.length === 2 && !tag)) return null;
  return tag ? `${name}#${tag}` : name;
}

/** The PUUID of the player named `name` in this game (archive, uploaders and their friends), or
 * null. The tag is required whenever the source knows it. */
export function findPlayer(name: string, entries: AramEntry[], raw: RawGame | null): string | null {
  const key = riotKey(name);
  if (!key) return null;
  const named = [
    ...(raw?.participantIdentities.map((i) => ({ puuid: i.player.puuid, name: riotId(i.player) })) ?? []),
    ...entries.flatMap((e) => [{ puuid: e.puuid, name: e.name }, ...e.with.map((m) => ({ puuid: m.puuid, name: m.name }))]),
  ];
  return named.find((p) => p.puuid && p.name && riotKey(p.name) === key)?.puuid ?? null;
}

/** The entry without the friends who asked to be hidden (same as when a player deletes their data). */
export function withoutHidden(entry: AramEntry, hidden: ReadonlySet<string>): AramEntry {
  if (!hidden.size || !entry.with.some((m) => hidden.has(m.puuid))) return entry;
  return { ...entry, with: entry.with.filter((m) => !hidden.has(m.puuid)) };
}

/** "Name Zwei#EUW" → "Name Zwei-EUW": the Riot ID in a profile address, as op.gg writes it. A tag
 * never has a "-", so the last one separates it. */
export const riotSlug = (riotId: string) => {
  const at = riotId.lastIndexOf('#');
  return at < 0 ? riotId : `${riotId.slice(0, at)}-${riotId.slice(at + 1)}`;
};

/** The search form (riotKey) of a profile address, or null when it is none. */
export function slugKey(slug: string): string | null {
  const at = slug.lastIndexOf('-');
  return riotKey(at < 0 ? slug : `${slug.slice(0, at)}#${slug.slice(at + 1)}`);
}
