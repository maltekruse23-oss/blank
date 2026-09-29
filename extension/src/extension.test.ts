import { describe, expect, it } from 'vitest';
import { channelOfUrl } from './channel';
import {
  connectPacket,
  isPayload,
  nextPacket,
  publishPacket,
  subscribePacket,
  type Incoming,
} from './mqtt';

const bytes = (text: string) => [...new TextEncoder().encode(text)];

describe('MQTT packets (same bytes as watch.rs)', () => {
  it('are built like MQTT 3.1.1', () => {
    expect([...connectPacket('blank-abc', 60)]).toEqual([
      0x10,
      21,
      0,
      4,
      ...bytes('MQTT'),
      4,
      0x02,
      0,
      60,
      0,
      9,
      ...bytes('blank-abc'),
    ]);
    expect([...subscribePacket('t/1')]).toEqual([0x82, 8, 0, 1, 0, 3, ...bytes('t/1'), 0]);
    expect([...publishPacket('t', 'x', true)]).toEqual([0x31, 4, 0, 1, ...bytes('tx')]);
    // Lengths over 127 take two bytes.
    expect([...publishPacket('t', 'A'.repeat(2000 - 3), false)].slice(0, 3)).toEqual([
      0x30, 0xd0, 0x0f,
    ]);
  });

  it('are read whole and one by one', () => {
    const topic = 'blank-watch/0123456789abcdef0123456789abcdef';
    const long = 'A'.repeat(300);
    const all = new Uint8Array([0x20, 2, 0, 0, ...publishPacket(topic, long, true)]);
    // The second packet arrives in two parts.
    const first = nextPacket(all.slice(0, 20));
    expect(first).not.toBeNull();
    expect(first).not.toBe('broken');
    const { packet, rest } = first as { packet: Incoming; rest: Uint8Array };
    expect(packet).toEqual({ kind: 'connack', code: 0 });
    expect(nextPacket(rest)).toBeNull();
    const joined = new Uint8Array([...rest, ...all.slice(20)]);
    const second = nextPacket(joined) as { packet: Incoming; rest: Uint8Array };
    expect(second.packet).toEqual({ kind: 'publish', topic, payload: long });
    expect(second.rest.length).toBe(0);
    // A broken length is refused instead of waiting forever.
    expect(nextPacket(new Uint8Array([0x30, 0xff, 0xff, 0xff, 0xff, 0x01]))).toBe('broken');
  });

  it('only pass on encrypted text', () => {
    expect(isPayload('q83v+/9=')).toBe(true);
    expect(isPayload('')).toBe(false);
    expect(isPayload('<script>')).toBe(false);
    expect(isPayload('A'.repeat(2049))).toBe(false);
  });
});

describe('channel of a tab', () => {
  it('is read only from the address of the channel page', () => {
    expect(channelOfUrl('https://www.twitch.tv/xqc')).toBe('xqc');
    expect(channelOfUrl('https://www.twitch.tv/Some_Channel_2/')).toBe('some_channel_2');
    expect(channelOfUrl('https://twitch.tv/xqc?referrer=raid')).toBe('xqc');
  });

  it('ignores Twitch pages, parts of channels and other sites', () => {
    for (const url of [
      'https://www.twitch.tv/',
      'https://www.twitch.tv/directory',
      'https://www.twitch.tv/settings',
      'https://www.twitch.tv/search?term=xqc',
      'https://www.twitch.tv/xqc/videos',
      'https://www.twitch.tv/xqc/clip/abc',
      'https://www.twitch.tv/moderator/xqc',
      'https://clips.twitch.tv/abc',
      'http://www.twitch.tv/xqc',
      'https://www.twitch.tv.evil.com/xqc',
      'https://evil.com/xqc',
      'not a url',
      undefined,
    ])
      expect(channelOfUrl(url)).toBeNull();
  });
});
