// MQTT 3.1.1 over secure WebSockets, only what a room needs (QoS 0: CONNECT, SUBSCRIBE, PUBLISH,
// PING, DISCONNECT) – the same packets as src-tauri/src/watch.rs, without a library.

const encoder = new TextEncoder();

function remainingLength(n: number) {
  const out: number[] = [];
  do {
    let byte = n % 128;
    n = Math.floor(n / 128);
    if (n > 0) byte |= 0x80;
    out.push(byte);
  } while (n > 0);
  return out;
}

function string(value: string) {
  const bytes = encoder.encode(value);
  return [bytes.length >> 8, bytes.length & 0xff, ...bytes];
}

function packet(first: number, body: number[]) {
  return new Uint8Array([first, ...remainingLength(body.length), ...body]);
}

/** Level 4 (3.1.1), clean session, keep alive in seconds. */
export const connectPacket = (client: string, keepAlive: number) =>
  packet(0x10, [...string('MQTT'), 4, 0x02, keepAlive >> 8, keepAlive & 0xff, ...string(client)]);

export const subscribePacket = (topic: string) => packet(0x82, [0, 1, ...string(topic), 0]);

export const publishPacket = (topic: string, payload: string, retain: boolean) =>
  packet(0x30 | (retain ? 1 : 0), [...string(topic), ...encoder.encode(payload)]);

export const PING = new Uint8Array([0xc0, 0]);
export const DISCONNECT = new Uint8Array([0xe0, 0]);

export type Incoming =
  | { kind: 'connack'; code: number }
  | { kind: 'publish'; topic: string; payload: string }
  | { kind: 'other' };

/**
 * Takes one whole packet from the front of `buffer` (a WebSocket message may hold several or
 * part of one): the packet and the rest, null until it is complete, "broken" for nonsense.
 */
export function nextPacket(
  buffer: Uint8Array,
): { packet: Incoming; rest: Uint8Array } | null | 'broken' {
  let length = 0;
  let i = 1;
  for (;;) {
    if (i >= buffer.length) return null;
    const byte = buffer[i]!;
    length += (byte & 0x7f) * 128 ** (i - 1);
    i++;
    if (!(byte & 0x80)) break;
    if (i > 4) return 'broken';
  }
  if (buffer.length < i + length) return null;
  const first = buffer[0]!;
  const body = buffer.subarray(i, i + length);
  const rest = buffer.slice(i + length);
  switch (first >> 4) {
    case 2:
      return body.length >= 2 ? { packet: { kind: 'connack', code: body[1]! }, rest } : 'broken';
    case 3: {
      if (body.length < 2) return 'broken';
      const size = (body[0]! << 8) | body[1]!;
      // QoS 1/2 would carry a packet id after the topic; this client subscribes with QoS 0.
      const start = 2 + size + (first & 0x06 ? 2 : 0);
      if (body.length < start) return 'broken';
      const decoder = new TextDecoder();
      return {
        packet: {
          kind: 'publish',
          topic: decoder.decode(body.subarray(2, 2 + size)),
          payload: decoder.decode(body.subarray(start)),
        },
        rest,
      };
    }
    default:
      return { packet: { kind: 'other' }, rest };
  }
}

/** Encrypted text as blank. sends it: base64 only, at most 2 KB. */
export const isPayload = (text: string) => text.length <= 2048 && /^[A-Za-z0-9+/=]+$/.test(text);

/** Pauses before reconnecting after a lost connection (seconds), as in watch.rs. */
const RETRY = [2, 5, 10, 30, 60];
const CONNECT_WITHIN_MS = 10_000;
const KEEP_ALIVE_S = 60;
/**
 * A ping every 20 s: the broker needs one within the keep alive, and the browser keeps the
 * extension's background running only while its WebSocket has traffic at least every 30 s.
 */
const PING_EVERY_MS = 20_000;

type Handlers = {
  message: (payload: string) => void;
  link: (up: boolean) => void;
};

/** One broker: connects, subscribes to the room's topic, reconnects with pauses until closed. */
export class BrokerLink {
  private socket: WebSocket | null = null;
  private closed = false;
  private attempt = 0;
  private timers: number[] = [];
  private up = false;

  constructor(
    private readonly address: string,
    private readonly topic: string,
    private readonly client: string,
    private readonly on: Handlers,
  ) {
    this.open();
  }

  private open() {
    if (this.closed) return;
    let buffer = new Uint8Array(0);
    let heard = Date.now();
    const socket = new WebSocket(this.address, 'mqtt');
    socket.binaryType = 'arraybuffer';
    this.socket = socket;
    const giveUp = setTimeout(() => !this.up && socket.close(), CONNECT_WITHIN_MS);
    socket.onopen = () => socket.send(connectPacket(this.client, KEEP_ALIVE_S));
    socket.onmessage = (event) => {
      if (!(event.data instanceof ArrayBuffer)) return;
      heard = Date.now();
      const data = new Uint8Array(event.data);
      const joined = new Uint8Array(buffer.length + data.length);
      joined.set(buffer);
      joined.set(data, buffer.length);
      buffer = joined;
      if (buffer.length > 8192) return socket.close();
      for (;;) {
        const next = nextPacket(buffer);
        if (next === null) break;
        if (next === 'broken') return socket.close();
        buffer = next.rest;
        const p = next.packet;
        if (p.kind === 'connack') {
          if (p.code !== 0) return socket.close();
          clearTimeout(giveUp);
          socket.send(subscribePacket(this.topic));
          this.up = true;
          this.attempt = 0;
          this.on.link(true);
        } else if (p.kind === 'publish' && p.topic === this.topic && isPayload(p.payload)) {
          // Empty kept messages only clear the room; they are not passed on.
          this.on.message(p.payload);
        }
      }
    };
    const ping = setInterval(() => {
      // No answer to the last pings: the connection is dead.
      if (Date.now() - heard > PING_EVERY_MS * 2 + 10_000) socket.close();
      else if (socket.readyState === WebSocket.OPEN) socket.send(PING);
    }, PING_EVERY_MS);
    socket.onclose = () => {
      clearTimeout(giveUp);
      clearInterval(ping);
      if (this.up) this.on.link(false);
      this.up = false;
      this.socket = null;
      if (this.closed) return;
      const wait = RETRY[Math.min(this.attempt, RETRY.length - 1)]! * 1000;
      this.attempt++;
      this.timers.push(setTimeout(() => this.open(), wait));
    };
    socket.onerror = () => socket.close();
  }

  /** `retain`: the broker keeps it for people who join later; an empty text clears that. */
  publish(payload: string, retain = false) {
    if (this.up && this.socket?.readyState === WebSocket.OPEN)
      this.socket.send(publishPacket(this.topic, payload, retain));
  }

  get connected() {
    return this.up;
  }

  close() {
    this.closed = true;
    this.timers.forEach(clearTimeout);
    const socket = this.socket;
    if (socket?.readyState === WebSocket.OPEN) socket.send(DISCONNECT);
    socket?.close();
  }
}
