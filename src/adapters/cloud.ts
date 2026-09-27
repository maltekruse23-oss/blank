// Online backup without an account (src-tauri/src/cloud.rs stores and fetches the text): the whole
// settings file is encrypted here with AES-GCM; the key comes from a random secret that exists
// only in the move code (PBKDF2, 600 000 rounds). The paste service only ever sees encrypted text.
// Desktop app only.
import { invoke, isTauri } from '@tauri-apps/api/core';
import { ALPHABET, checkChars, crockford, fromBase64, randomSecret, toBase64 } from './codes';

const SECRET_LENGTH = 10;
const ROUNDS = 600_000;
const PREFIX = 'blank1:';

export type Provider = 'D' | 'C';
/** secret: the key's source; provider and id: where the encrypted text lies. */
export type MoveCode = { secret: string; provider: Provider; id: string };

/** Groups of five, e.g. "7F3K9-2QDXW-D9EAJ-DWRAG-4M": secret, service, id, check characters. */
export function formatCode(code: MoveCode) {
  const raw = code.secret + code.provider + code.id;
  return (raw + checkChars(raw)).match(/.{1,5}/g)!.join('-');
}

/**
 * A typed code; case, spaces and dashes do not matter, O/I/L in the secret mean 0/1/1. "typo":
 * long enough, but the check characters do not fit.
 */
export function parseCode(input: string): MoveCode | 'typo' | null {
  const typed = input.toUpperCase().replace(/[^0-9A-Z]/g, '');
  if (typed.length < SECRET_LENGTH + 9) return null;
  const secret = crockford(typed.slice(0, SECRET_LENGTH));
  const provider = typed[SECRET_LENGTH];
  const id = typed.slice(SECRET_LENGTH + 1, -2);
  const check = crockford(typed.slice(-2));
  if (![...secret].every((c) => ALPHABET.includes(c))) return 'typo';
  if (provider !== 'D' && provider !== 'C') return 'typo';
  if (checkChars(secret + provider + id) !== check) return 'typo';
  if (provider === 'D' && id.length >= 6 && id.length <= 16) return { secret, provider, id };
  if (provider === 'C' && id.length === 6) return { secret, provider, id };
  return 'typo';
}

async function keyFrom(secret: string, salt: Uint8Array) {
  const base = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: ROUNDS, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

/** "blank1:" + base64(salt 16 | iv 12 | AES-GCM ciphertext with tag). */
export async function encrypt(plain: string, secret: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await keyFrom(secret, salt);
  const data = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plain)),
  );
  const all = new Uint8Array(28 + data.length);
  all.set(salt);
  all.set(iv, 16);
  all.set(data, 28);
  return PREFIX + toBase64(all);
}

/** The plain text, or null when the secret does not fit (or the text was changed). */
export async function decrypt(text: string, secret: string): Promise<string | null> {
  if (!text.startsWith(PREFIX)) return null;
  try {
    const all = fromBase64(text.slice(PREFIX.length));
    const key = await keyFrom(secret, all.slice(0, 16));
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: all.slice(16, 28) },
      key,
      all.slice(28),
    );
    return new TextDecoder().decode(plain);
  } catch {
    return null;
  }
}

export const cloud = isTauri()
  ? {
      /** Encrypts and stores all settings (content: the web part); resolves to the move code. */
      async backup(content: string): Promise<MoveCode> {
        const full = await invoke<string>('settings_complete', { content });
        const secret = randomSecret(SECRET_LENGTH);
        const stored = await invoke<{ provider: Provider; id: string }>('cloud_upload', {
          text: await encrypt(full, secret),
        });
        return { secret, ...stored };
      },
      /** The settings file of a move code; rejects with a German message. */
      async restore(code: MoveCode): Promise<string> {
        const text = await invoke<string>('cloud_download', {
          provider: code.provider,
          id: code.id,
        });
        const plain = await decrypt(text, code.secret);
        if (plain === null) throw new Error('Code stimmt nicht.');
        return plain;
      },
    }
  : null;
