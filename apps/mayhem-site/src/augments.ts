// Names and small icons of ARAM Mayhem augments. Data Dragon has none of them; blank. reads them
// from the League client (cherry-augments.json, as for its own cards) and sends them with the
// uploads. Only augments that appear in an uploaded game are taken, every value strictly checked,
// and an icon must be a small real PNG. Pure, tested in the app's repo
// (src/features/aram/siteAugments.test.ts).

export const RARITIES = ['prismatic', 'gold', 'silver', ''] as const;
export type Rarity = (typeof RARITIES)[number];

/** What the pages get: name and rarity, and whether there is an icon (/api/augments/<id>.png). */
export type AugmentInfo = { name: string; rarity: Rarity; icon: boolean };

/** At most this many bytes of PNG per icon (the client's small icons are a few KB). */
export const MAX_ICON_BYTES = 24 * 1024;
/** At most this many pixels wide and high. */
export const MAX_ICON_SIDE = 256;
export const MAX_PER_UPLOAD = 40;

const DATA_URL = 'data:image/png;base64,';

/** Decodes standard base64 strictly; null when anything is off. */
export function decodeBase64(text: string): Uint8Array | null {
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(text)) return null;
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** Width and height of a PNG (from its IHDR), null when it is not one. */
export function pngSize(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes.length < 33 || SIGNATURE.some((b, i) => bytes[i] !== b)) return null;
  const ihdr = String.fromCharCode(...bytes.slice(12, 16));
  if (ihdr !== 'IHDR') return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

/**
 * The base64 of an icon sent as data URL ("data:image/png;base64,…", as blank. stores it), or
 * null when it is not a small, real PNG.
 */
export function iconOf(dataUrl: string): string | null {
  if (!dataUrl.startsWith(DATA_URL)) return null;
  const text = dataUrl.slice(DATA_URL.length);
  if (text.length > Math.ceil(MAX_ICON_BYTES / 3) * 4) return null;
  const bytes = decodeBase64(text);
  if (!bytes || bytes.length > MAX_ICON_BYTES) return null;
  const size = pngSize(bytes);
  if (!size || size.width < 1 || size.height < 1 || size.width > MAX_ICON_SIDE || size.height > MAX_ICON_SIDE) return null;
  return text;
}

/** A name as the pages show it: not empty, at most 80 characters, no control characters or <>. */
export function validName(name: string) {
  return name.trim().length > 0 && [...name].length <= 80 && !/[\u0000-\u001f\u007f-\u009f<>]/u.test(name);
}

/** The augments of a participant of the client's raw game (playerAugment1–6, 0 = none). */
export function rawAugments(stats: Partial<Record<string, number | boolean>>): number[] {
  const list: number[] = [];
  for (let n = 1; n <= 6; n++) {
    const id = stats[`playerAugment${n}`];
    if (typeof id === 'number' && Number.isInteger(id) && id > 0) list.push(id);
  }
  return list;
}
