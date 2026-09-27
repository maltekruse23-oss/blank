// Short codes people type or read out (move code of the online backup, room code of watch
// together): Crockford letters and two check characters that catch every single typo.

/** Crockford base32: no I, L, O or U, so a code can hardly be misread. */
export const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

export function randomSecret(length: number) {
  // 256 is a multiple of 32, so every letter is equally likely.
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return [...bytes].map((b) => ALPHABET[b % 32]).join('');
}

const CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/**
 * Two check characters over the code. The weighted sum is taken modulo the prime 1021: with
 * values up to 36 and weights up to 30, no single wrong character and no swap of two neighbours
 * can leave it unchanged, so every such typo is caught.
 */
export function checkChars(raw: string) {
  let sum = 0;
  for (let i = 0; i < raw.length; i++) sum = (sum + (i + 1) * (CHARS.indexOf(raw[i]!) + 1)) % 1021;
  return ALPHABET[Math.floor(sum / 32)]! + ALPHABET[sum % 32]!;
}

/** Crockford reading: O means 0, I and L mean 1. */
export const crockford = (text: string) => text.replace(/O/g, '0').replace(/[IL]/g, '1');

export function toBase64(bytes: Uint8Array) {
  let text = '';
  for (let i = 0; i < bytes.length; i += 0x8000)
    text += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(text);
}

export const fromBase64 = (text: string) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
