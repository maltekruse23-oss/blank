import { useEffect, useRef, useState } from 'react';
import type { AramAdapter, AramEntry, AramPlayer } from '../../adapters/aram';
import {
  byName,
  formatGroupCode,
  gameQuality,
  groupTransport,
  MAX_MEMBERS,
  memberId,
  newGroupSecret,
  openGroup,
  openMessage,
  parseGroupCode,
  readGroupMessage,
  sealMessage,
  type Group,
  type GroupMessage,
} from '../../adapters/aramGroup';
import type { Broker } from '../../adapters/watch';

/** After a broker came up, what it keeps arrives at once; then this app adds what it lacks. */
const SETTLE_MS = 2500;
/** Games arriving together are stored together. */
const MERGE_MS = 400;
/** A local change (a new game) goes out a moment later, together with what follows it. */
const AFTER_CHANGE_MS = 800;

export type AramGroupView = {
  code: string;
  /** The members, the user included once known; the same order for everyone. */
  members: AramPlayer[];
  /** The group's start: only games that began later count. */
  since: number | null;
  links: Record<Broker, boolean>;
  /** The user is not known yet (League client never open here): not listed for the others. */
  meUnknown: boolean;
};

type Live = {
  group: Group;
  /** By sub-topic "m/<id>". */
  members: Map<string, { player: AramPlayer; at: number }>;
  reset: { since: number; at: number } | null;
  /** What each broker keeps: games by quality, the start by its time, members as 1. */
  kept: Record<Broker, Map<string, number>>;
  up: Record<Broker, boolean>;
  /** Games of players not (yet) known as members. */
  held: AramEntry[];
  ids: Map<string, string>;
  me: AramPlayer | null;
  timers: Partial<Record<'merge' | 'exchange', number>>;
  exchange: () => Promise<void>;
  show: () => void;
};

/**
 * The ARAM group (user's wish: the same leaderboard for everyone; src/adapters/aramGroup.ts),
 * while a group code is set – for the whole app, so games are exchanged also while the page is
 * closed. Connected to the brokers only then. What arrives is stored (aram.rs checks it); what the
 * brokers lack is added: the user as member, the group's start, every game of a member in its
 * best version. So every member's app ends up with the same games, the same start and the same
 * players – and so the same leaderboard.
 */
export function useAramGroup(adapter: AramAdapter, code: string, setCode: (code: string) => void) {
  const [view, setView] = useState<AramGroupView | null>(null);
  const live = useRef<Live | null>(null);
  /** A group being created: its start. */
  const starting = useRef<number | null>(null);
  const parsed = code ? parseGroupCode(code) : null;
  const secret = parsed && parsed !== 'typo' ? parsed : null;

  useEffect(() => {
    const transport = groupTransport;
    if (!transport || !secret) {
      setView(null);
      return;
    }
    let active = true;
    const stops: (() => void)[] = [];
    let g: Live | null = null;

    const idOf = async (puuid: string) => {
      let id = g!.ids.get(puuid);
      if (!id) {
        id = await memberId(g!.group.topic, puuid);
        g!.ids.set(puuid, id);
      }
      return id;
    };
    const players = () => {
      const list = [...g!.members.values()].map((m) => m.player);
      if (g!.me && !list.some((p) => p.puuid === g!.me!.puuid)) list.push(g!.me);
      return list.sort(byName).slice(0, MAX_MEMBERS);
    };
    const show = () => {
      if (!active || !g) return;
      setView({
        code: g.group.code,
        members: players(),
        since: g.reset?.since ?? null,
        links: { ...g.up },
        meUnknown: g.me === null,
      });
    };
    const later = (key: 'merge' | 'exchange', ms: number, run: () => void) => {
      if (!g) return;
      window.clearTimeout(g.timers[key]);
      g.timers[key] = window.setTimeout(run, ms);
    };
    const publish = async (sub: string, message: GroupMessage) =>
      transport.send(sub, await sealMessage(message, g!.group));

    /** Stores the games that arrived, of the players known as members. */
    const merge = () => {
      if (!g) return;
      const members = players().map((p) => p.puuid);
      const known = g.held.filter((e) => members.includes(e.puuid));
      g.held = g.held.filter((e) => !members.includes(e.puuid)).slice(-2000);
      if (known.length > 0) void adapter.merge(known, members).catch(() => undefined);
    };

    /** Adds to the brokers that are there what they lack. */
    const exchange = async () => {
      if (!g || !active) return;
      const brokers = (Object.keys(g.up) as Broker[]).filter((b) => g!.up[b]);
      if (brokers.length === 0) return;
      const data = await adapter.data().catch(() => null);
      if (!data || !g || !active) return;
      const lacks = (sub: string, value: number) =>
        brokers.some((b) => (g!.kept[b].get(sub) ?? 0) < value);
      const kept = (sub: string, value: number) => {
        for (const b of brokers) g!.kept[b].set(sub, Math.max(value, g!.kept[b].get(sub) ?? 0));
      };
      if (data.me) {
        g.me = data.me;
        const sub = `m/${await idOf(data.me.puuid)}`;
        const known = g.members.get(sub);
        const changed =
          !known || known.player.name !== data.me.name || known.player.icon !== data.me.icon;
        if (changed || lacks(sub, 1)) {
          const record = { player: data.me, at: changed ? Date.now() : known.at };
          g.members.set(sub, record);
          await publish(sub, { t: 'member', ...record });
          kept(sub, 1);
        }
      }
      if (g.reset && lacks('r', g.reset.at)) {
        await publish('r', { t: 'reset', ...g.reset });
        kept('r', g.reset.at);
      }
      const members = new Set(players().map((p) => p.puuid));
      const since = g.reset?.since ?? null;
      for (const entry of data.games) {
        if (!members.has(entry.puuid) || (since !== null && entry.at < since)) continue;
        const sub = `g/${entry.gameId}-${await idOf(entry.puuid)}`;
        const quality = gameQuality(entry);
        if (!lacks(sub, quality)) continue;
        await publish(sub, { t: 'game', entry });
        kept(sub, quality);
      }
      show();
    };

    const receive = async (broker: Broker, sub: string, text: string) => {
      if (!g || !active) return;
      if (text === '') {
        // Cleared: a member left.
        g.kept[broker].delete(sub);
        if (sub.startsWith('m/') && g.members.delete(sub)) show();
        return;
      }
      const message = readGroupMessage(sub, await openMessage(text, g.group));
      if (!message || !g || !active) return;
      if (message.t === 'member') {
        if (sub !== `m/${await idOf(message.player.puuid)}`) return;
        g.kept[broker].set(sub, 1);
        const known = g.members.get(sub);
        if (!known || message.at > known.at) {
          g.members.set(sub, { player: message.player, at: message.at });
          show();
          later('merge', MERGE_MS, merge);
          // Games of the new member this app has go out too.
          later('exchange', SETTLE_MS, () => void exchange());
        }
      } else if (message.t === 'reset') {
        g.kept[broker].set('r', Math.max(message.at, g.kept[broker].get('r') ?? 0));
        // The latest start wins everywhere (both brokers, every app).
        if (!g.reset || message.at > g.reset.at) {
          g.reset = { since: message.since, at: message.at };
          void adapter.setSince(message.since).catch(() => undefined);
          show();
        }
      } else {
        const { entry } = message;
        if (sub !== `g/${entry.gameId}-${await idOf(entry.puuid)}`) return;
        g.kept[broker].set(sub, Math.max(gameQuality(entry), g.kept[broker].get(sub) ?? 0));
        g.held.push(entry);
        later('merge', MERGE_MS, merge);
      }
    };

    void (async () => {
      const group = await openGroup(secret);
      if (!active) return;
      g = {
        group,
        members: new Map(),
        reset: null,
        kept: { hivemq: new Map(), mosquitto: new Map() },
        up: { hivemq: false, mosquitto: false },
        held: [],
        ids: new Map(),
        me: null,
        timers: {},
        exchange,
        show,
      };
      live.current = g;
      // A new group starts now; its start goes out as soon as a broker is there.
      if (starting.current !== null) {
        g.reset = { since: starting.current, at: starting.current };
        starting.current = null;
        void adapter.setSince(g.reset.since).catch(() => undefined);
      }
      const data = await adapter.data().catch(() => null);
      if (!active || !g) return;
      g.me = data?.me ?? null;
      show();
      stops.push(transport.onMessage((m) => void receive(m.broker, m.sub, m.text)));
      stops.push(
        transport.onLink(({ broker, up }) => {
          if (!g) return;
          g.up[broker] = up;
          // Back again, the broker sends everything it keeps anew.
          if (!up) g.kept[broker].clear();
          show();
          if (up) later('exchange', SETTLE_MS, () => void exchange());
        }),
      );
      stops.push(adapter.onUpdate(() => later('exchange', AFTER_CHANGE_MS, () => void exchange())));
      await transport.open(group.topic).catch(() => undefined);
    })();

    return () => {
      active = false;
      stops.forEach((stop) => stop());
      if (g) Object.values(g.timers).forEach((t) => window.clearTimeout(t));
      live.current = null;
      void transport.close().catch(() => undefined);
    };
  }, [adapter, secret]);

  return {
    view,
    /** Groups exist only in the desktop app. */
    available: groupTransport !== null,
    /** A new group, starting now (the leaderboard counts from here for everyone). */
    create: () => {
      starting.current = Date.now();
      setCode(formatGroupCode(newGroupSecret()));
    },
    /** Joins with a typed code: "incomplete" while typing, "typo" if the check fails. */
    join: (input: string): 'ok' | 'typo' | 'incomplete' => {
      const typed = parseGroupCode(input);
      if (typed === null) return 'incomplete';
      if (typed === 'typo') return 'typo';
      setCode(formatGroupCode(typed));
      return 'ok';
    },
    /** Leaves: the user is no longer listed for the others; the games stay. */
    leave: async () => {
      const g = live.current;
      if (g?.me && groupTransport) {
        const sub = `m/${await memberId(g.group.topic, g.me.puuid)}`;
        await groupTransport.send(sub, '').catch(() => undefined);
      }
      setCode('');
    },
    /** Starts the leaderboard anew for everyone in the group (the latest start wins). */
    restart: async () => {
      const g = live.current;
      if (!g) return;
      const now = Date.now();
      g.reset = { since: now, at: now };
      await adapter.setSince(now).catch(() => undefined);
      g.show();
      await g.exchange();
    },
  };
}

export type AramGroupHook = ReturnType<typeof useAramGroup>;
