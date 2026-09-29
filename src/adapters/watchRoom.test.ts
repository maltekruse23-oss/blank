import { describe, expect, it } from 'vitest';
import { ALPHABET } from './codes';
import {
  channelFromInput,
  formatRoomCode,
  newRoomSecret,
  openMessage,
  openRoom,
  parseRoomCode,
  readMessage,
  sealMessage,
} from './watchRoom';

describe('room code', () => {
  it('reads back as typed, in any case and with spaces or O instead of 0', () => {
    for (let i = 0; i < 50; i++) {
      const secret = newRoomSecret();
      const code = formatRoomCode(secret);
      expect(code).toMatch(/^[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4}$/);
      expect(parseRoomCode(code)).toBe(secret);
      expect(parseRoomCode(code.toLowerCase().replace(/-/g, ' '))).toBe(secret);
      expect(parseRoomCode(code.replace(/0/g, 'O'))).toBe(secret);
    }
    expect(parseRoomCode('7F3K-9QDX')).toBeNull();
  });

  it('catches every single wrong, missing, extra or swapped character', () => {
    for (let i = 0; i < 20; i++) {
      const plain = formatRoomCode(newRoomSecret()).replace(/-/g, '');
      const variants: string[] = [];
      for (let p = 0; p < plain.length; p++) {
        for (const c of ALPHABET)
          if (c !== plain[p]) variants.push(plain.slice(0, p) + c + plain.slice(p + 1));
        for (const c of ALPHABET) variants.push(plain.slice(0, p) + c + plain.slice(p));
        variants.push(plain.slice(0, p) + plain.slice(p + 1));
        if (p + 1 < plain.length && plain[p] !== plain[p + 1])
          variants.push(plain.slice(0, p) + plain[p + 1] + plain[p] + plain.slice(p + 2));
      }
      for (const variant of variants) {
        const read = parseRoomCode(variant);
        expect(read === 'typo' || read === null).toBe(true);
      }
    }
  });
});

describe('room', () => {
  it('gets the same topic from the same secret, and messages only open with its key', async () => {
    const secret = newRoomSecret();
    const a = await openRoom(secret);
    const b = await openRoom(secret);
    expect(a.topic).toBe(b.topic);
    expect(a.topic).toMatch(/^blank-watch\/[0-9a-f]{32}$/);
    const message = {
      t: 'state' as const,
      id: 'abcdefghijkl',
      name: 'Tim',
      channel: 'xqc',
      display: 'xQc',
      seq: 3,
    };
    const sealed = await sealMessage(message, a.key);
    expect(await openMessage(sealed, b.key)).toEqual(message);
    const other = await openRoom(newRoomSecret());
    expect(await openMessage(sealed, other.key)).toBeNull();
    expect(await openMessage('bm90IGEgbWVzc2FnZQ==', a.key)).toBeNull();
  }, 20_000);

  it('drops messages of the wrong form or too old', () => {
    const now = Date.now();
    const base = { v: 1, at: now, id: 'abcdefghijkl' };
    expect(readMessage({ ...base, t: 'here', name: 'Tim' }, now)).toEqual({
      t: 'here',
      id: 'abcdefghijkl',
      name: 'Tim',
    });
    expect(readMessage({ ...base, t: 'here', name: 'Tim', at: now - 11 * 60_000 }, now)).toBeNull();
    expect(readMessage({ ...base, t: 'here', name: '' }, now)).toBeNull();
    expect(
      readMessage({ ...base, t: 'state', name: 'Tim', channel: 'a&b', display: 'x', seq: 1 }, now),
    ).toBeNull();
    expect(readMessage({ ...base, v: 2, t: 'bye' }, now)).toBeNull();
    expect(readMessage({ ...base, id: 'short', t: 'bye' }, now)).toBeNull();
  });

  it('takes a channel as typed or pasted', () => {
    expect(channelFromInput('xQc')).toBe('xqc');
    expect(channelFromInput('https://www.twitch.tv/xqc/videos')).toBe('xqc');
    expect(channelFromInput('a b')).toBeNull();
  });
});
