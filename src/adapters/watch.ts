// Watch together (src-tauri/src/watch.rs carries the messages): a room is a random secret that
// exists only in the room code. From it come the topic on the brokers and the AES-GCM key
// (PBKDF2); everything is encrypted here, the brokers only ever see unreadable text. Desktop app
// only.
import { invoke, isTauri } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { ALPHABET, checkChars, crockford, fromBase64, randomSecret, toBase64 } from './codes';

const SECRET_LENGTH = 10;
const ROUNDS = 200_000;
const SALT = 'blank.watch.v1';
const TOPIC_PREFIX = 'blank-watch/';
/** Messages that are not kept by the brokers count only this long (clocks may differ a bit). */
const FRESH_MS = 10 * 60_000;

export type Broker = 'hivemq' | 'mosquitto';
export const brokers: Broker[] = ['hivemq', 'mosquitto'];

export type Room = { secret: string; code: string; topic: string; key: CryptoKey };

/** Groups of four, e.g. "7F3K-9QDX-WDM4": ten letters of secret, two check characters. */
export function formatRoomCode(secret: string) {
  return (secret + checkChars(secret)).match(/.{1,4}/g)!.join('-');
}

/**
 * A typed room code; case, spaces and dashes do not matter, O/I/L mean 0/1/1. null: not
 * complete yet; "typo": complete, but the check characters do not fit.
 */
export function parseRoomCode(input: string): string | 'typo' | null {
  const typed = crockford(input.toUpperCase().replace(/[^0-9A-Z]/g, ''));
  if (typed.length < SECRET_LENGTH + 2) return null;
  const secret = typed.slice(0, SECRET_LENGTH);
  if (typed.length > SECRET_LENGTH + 2 || ![...typed].every((c) => ALPHABET.includes(c)))
    return 'typo';
  return checkChars(secret) === typed.slice(SECRET_LENGTH) ? secret : 'typo';
}

export const newRoomSecret = () => randomSecret(SECRET_LENGTH);

/** Topic and key of a room; both only from the secret. */
export async function openRoom(secret: string): Promise<Room> {
  const { topic, key } = await deriveChannel(secret, SALT, TOPIC_PREFIX);
  return { secret, code: formatRoomCode(secret), topic, key };
}

/** A topic (prefix + 32 hex) and an AES-GCM key from a secret (PBKDF2); also for ARAM groups. */
export async function deriveChannel(secret: string, salt: string, prefix: string) {
  const base = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const bits = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: 'PBKDF2', salt: new TextEncoder().encode(salt), iterations: ROUNDS, hash: 'SHA-256' },
      base,
      384,
    ),
  );
  const topic =
    prefix + [...bits.slice(0, 16)].map((b) => b.toString(16).padStart(2, '0')).join('');
  const key = await crypto.subtle.importKey('raw', bits.slice(16), 'AES-GCM', false, [
    'encrypt',
    'decrypt',
  ]);
  return { topic, key };
}

/** base64(iv 12 | AES-GCM ciphertext with tag). */
export async function seal(plain: string, key: CryptoKey) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plain)),
  );
  const all = new Uint8Array(12 + data.length);
  all.set(iv);
  all.set(data, 12);
  return toBase64(all);
}

export async function open(text: string, key: CryptoKey): Promise<string | null> {
  try {
    const all = fromBase64(text);
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: all.slice(0, 12) },
      key,
      all.slice(12),
    );
    return new TextDecoder().decode(plain);
  } catch {
    return null;
  }
}

// --- Messages ---

/** state: the room's channel (kept by the brokers for latecomers; the highest seq wins). */
export type WatchMessage =
  | { t: 'state'; id: string; name: string; channel: string; display: string; seq: number }
  /** Present in the room (on joining, then every minute). */
  | { t: 'here'; id: string; name: string }
  | { t: 'bye'; id: string }
  /** Everyone starts the stream anew, back at the live edge. */
  | { t: 'sync'; id: string; name: string };

const isId = (v: unknown): v is string => typeof v === 'string' && /^[a-z0-9]{12}$/.test(v);
/** Names and display names: 1–24 characters, no control characters. */
const isName = (v: unknown): v is string =>
  typeof v === 'string' && v.trim() === v && v.length >= 1 && v.length <= 24 && !/\p{Cc}/u.test(v);
export const isChannel = (v: unknown): v is string =>
  typeof v === 'string' && /^[a-z0-9_]{3,25}$/.test(v);

export const newMemberId = () =>
  [...crypto.getRandomValues(new Uint8Array(12))]
    .map((b) => '0123456789abcdefghijklmnopqrstuvwxyz'[b % 36])
    .join('');

/** A channel as typed or pasted: "xQc", "twitch.tv/xqc" or the full link. */
export function channelFromInput(input: string): string | null {
  const text = input
    .trim()
    .replace(/^https?:\/\/(www\.)?/i, '')
    .replace(/^twitch\.tv\//i, '');
  const login = text.split(/[/?#]/)[0]!.toLowerCase();
  return isChannel(login) ? login : null;
}

/** Only well-formed messages; everything else is dropped. */
export function readMessage(raw: unknown, now = Date.now()): WatchMessage | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const m = raw as Record<string, unknown>;
  if (m.v !== 1 || typeof m.at !== 'number' || !isId(m.id)) return null;
  // Kept state may be old; everything else must be recent.
  if (m.t !== 'state' && Math.abs(now - m.at) > FRESH_MS) return null;
  switch (m.t) {
    case 'state':
      return isName(m.name) &&
        isChannel(m.channel) &&
        isName(m.display) &&
        Number.isInteger(m.seq) &&
        (m.seq as number) > 0 &&
        (m.seq as number) < 1e9
        ? {
            t: 'state',
            id: m.id,
            name: m.name,
            channel: m.channel,
            display: m.display,
            seq: m.seq as number,
          }
        : null;
    case 'here':
      return isName(m.name) ? { t: 'here', id: m.id, name: m.name } : null;
    case 'sync':
      return isName(m.name) ? { t: 'sync', id: m.id, name: m.name } : null;
    case 'bye':
      return { t: 'bye', id: m.id };
    default:
      return null;
  }
}

/** A name for others to see: trimmed, at most 24 characters, no control characters. */
export const cleanName = (name: string) =>
  name
    .replace(/\p{Cc}/gu, '')
    .trim()
    .slice(0, 24)
    .trim();

export const watch = isTauri()
  ? {
      join: (room: Room, member: string) =>
        invoke<void>('watch_join', { topic: room.topic, client: member }),
      /** `keep`: the brokers keep it for people who join later (the current channel). */
      async send(room: Room, message: WatchMessage, keep = false) {
        const data = await seal(JSON.stringify({ v: 1, at: Date.now(), ...message }), room.key);
        await invoke<void>('watch_send', { data, retain: keep });
      },
      /** `clear`: nobody else is in the room; the brokers forget its channel. */
      leave: (clear: boolean) => invoke<void>('watch_leave', { clear }),
      /** Shows a channel in Twitch's player window; `reload`: start it anew (live edge). */
      player: (channel: string, reload = false) =>
        invoke<void>('watch_player', { channel, reload }),
      closePlayer: () => invoke<void>('watch_player_close'),
      /** Messages of the room, decrypted and checked; `raw` tells repeats apart. */
      onMessage(room: Room, handler: (message: WatchMessage, raw: string) => void) {
        const stop = listen<string>('watch-message', (event) => {
          void open(event.payload, room.key).then((plain) => {
            if (plain === null) return;
            try {
              const message = readMessage(JSON.parse(plain));
              if (message) handler(message, event.payload);
            } catch {
              // Not JSON: ignored.
            }
          });
        });
        return () => void stop.then((unlisten) => unlisten());
      },
      onLink(handler: (link: { broker: Broker; up: boolean }) => void) {
        const stop = listen<{ broker: Broker; up: boolean }>('watch-link', (e) =>
          handler(e.payload),
        );
        return () => void stop.then((unlisten) => unlisten());
      },
      onPlayerClosed(handler: () => void) {
        const stop = listen('watch-player-closed', () => handler());
        return () => void stop.then((unlisten) => unlisten());
      },
    }
  : null;
