// ARAM group (user's wish: the same leaderboard for every friend; src-tauri/src/aram_group.rs
// carries the messages). A group is a random secret that exists only in its code (the same form
// as a watch-together room code); from it come the topic on the brokers and the key, everything
// is encrypted here. Kept on the brokers: each member ("m/<id>"), the group's start ("r") and
// every game of a member ("g/<game>-<id>"). Desktop app only.
import { invoke, isTauri } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { readAramFriends, type AramEntry, type AramPlayer } from './aram';
import {
  deriveChannel,
  formatRoomCode,
  newMemberId,
  newRoomSecret,
  open,
  parseRoomCode,
  seal,
  type Broker,
} from './watch';

const SALT = 'blank.aram.v1';
const PREFIX = 'blank-aram/';
/** With the user ten, as many as in one game. */
export const MAX_MEMBERS = 10;

export type Group = { secret: string; code: string; topic: string; key: CryptoKey };

export const newGroupSecret = newRoomSecret;
export const formatGroupCode = formatRoomCode;
export const parseGroupCode = parseRoomCode;
/** A stored group code: exactly as formatted, with fitting check characters. */
export function isGroupCode(code: string) {
  const secret = /^[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4}$/.test(code) ? parseRoomCode(code) : null;
  return secret !== null && secret !== 'typo';
}

export async function openGroup(secret: string): Promise<Group> {
  const { topic, key } = await deriveChannel(secret, SALT, PREFIX);
  return { secret, code: formatRoomCode(secret), topic, key };
}

/** A member's id in the topics: not the PUUID itself (16 hex of SHA-256 over topic and PUUID). */
export async function memberId(topic: string, puuid: string) {
  const hash = new Uint8Array(
    await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${topic}:${puuid}`)),
  );
  return [...hash.slice(0, 8)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** How good a version of a game is (as quality() in aram.rs): everyone keeps the best; the same
 * values with the skin played count a little more, so the skin reaches everyone. */
export const gameQuality = (entry: AramEntry) =>
  (entry.provisional ? 1 : entry.details === null ? 2 : entry.lobby?.length ? 4 : 3) * 2 +
  (typeof entry.skin === 'number' ? 1 : 0);

export type GroupMessage =
  | { t: 'member'; player: AramPlayer; at: number }
  | { t: 'reset'; since: number; at: number }
  | { t: 'game'; entry: AramEntry };

/** Not before 2020, not more than a day ahead (clocks differ a little). */
const plausible = (value: unknown, now: number): value is number =>
  typeof value === 'number' &&
  Number.isInteger(value) &&
  value >= 1_577_836_800_000 &&
  value <= now + 86_400_000;

/**
 * A decrypted message, checked against the sub-topic it was kept under; null if anything is off.
 * A game's values are checked strictly where it is stored (aram_merge in aram.rs).
 */
export function readGroupMessage(sub: string, raw: unknown, now = Date.now()): GroupMessage | null {
  if (!raw || typeof raw !== 'object') return null;
  const m = raw as Record<string, unknown>;
  if (m.v !== 1) return null;
  if (sub === 'r' && m.t === 'reset' && plausible(m.since, now) && plausible(m.at, now))
    return { t: 'reset', since: m.since, at: m.at };
  if (sub.startsWith('m/') && m.t === 'member' && plausible(m.at, now)) {
    const [player] = readAramFriends([m.player]);
    return player ? { t: 'member', player, at: m.at } : null;
  }
  if (sub.startsWith('g/') && m.t === 'game' && m.entry && typeof m.entry === 'object') {
    const entry = m.entry as AramEntry;
    if (
      typeof entry.gameId === 'number' &&
      Number.isInteger(entry.gameId) &&
      typeof entry.puuid === 'string' &&
      plausible(entry.at, now) &&
      sub.startsWith(`g/${entry.gameId}-`)
    )
      return { t: 'game', entry };
  }
  return null;
}

export const sealMessage = (message: GroupMessage, group: Group) =>
  seal(JSON.stringify({ v: 1, ...message }), group.key);

export async function openMessage(text: string, group: Group): Promise<unknown> {
  const plain = await open(text, group.key);
  if (plain === null) return null;
  try {
    return JSON.parse(plain) as unknown;
  } catch {
    return null;
  }
}

export type GroupTransport = {
  open: (topic: string) => Promise<void>;
  /** `data` empty: the kept message goes (a member leaves). */
  send: (sub: string, data: string) => Promise<void>;
  close: () => Promise<void>;
  onMessage: (handler: (m: { broker: Broker; sub: string; text: string }) => void) => () => void;
  onLink: (handler: (link: { broker: Broker; up: boolean }) => void) => () => void;
};

export const groupTransport: GroupTransport | null = isTauri()
  ? {
      open: (topic) => invoke<void>('aram_group_open', { topic, client: newMemberId() }),
      send: (sub, data) => invoke<void>('aram_group_send', { sub, data, retain: true }),
      close: () => invoke<void>('aram_group_close'),
      onMessage: (handler) => {
        const stop = listen<{ broker: Broker; sub: string; text: string }>(
          'aram-group-message',
          (event) => handler(event.payload),
        );
        return () => void stop.then((unlisten) => unlisten());
      },
      onLink: (handler) => {
        const stop = listen<{ broker: Broker; up: boolean }>('aram-group-link', (event) =>
          handler(event.payload),
        );
        return () => void stop.then((unlisten) => unlisten());
      },
    }
  : null;

/** Everyone sees the players in the same order: by name, then PUUID (never "me first"). */
export function byName(a: AramPlayer, b: AramPlayer) {
  // Plain comparisons: the same on every PC (no language rules of the WebView).
  const [x, y] = [a.name.toLowerCase(), b.name.toLowerCase()];
  if (x !== y) return x < y ? -1 : 1;
  return a.puuid < b.puuid ? -1 : a.puuid > b.puuid ? 1 : 0;
}
