// Watch together: the room lives in the app (not in the Twitch page), so it stays while other
// pages are open. Everyone may switch the channel; the newest switch wins (seq, then member id).
import { useEffect, useRef, useState } from 'react';
import {
  brokers,
  cleanName,
  newMemberId,
  newRoomSecret,
  openRoom,
  parseRoomCode,
  watch,
  type Broker,
  type Room,
  type WatchMessage,
} from '../../adapters/watch';

/** Presence: a sign of life every minute; who was not heard from for 2.5 minutes is gone. */
const HERE_EVERY_MS = 60_000;
const GONE_AFTER_MS = 150_000;

export type RoomChannel = { login: string; display: string; by: string; seq: number; id: string };
export type Member = { name: string; seen: number };
export type WatchData = NonNullable<ReturnType<typeof useWatch>>;

/**
 * `name`: the name others see; `lastRoom`: code of the last room (offered to join again, never
 * joined by itself); `remember`: stores both after entering a room.
 */
export function useWatch(
  name: string,
  lastRoom: string,
  remember: (name: string, room: string) => void,
) {
  const me = useRef(newMemberId()).current;
  const [room, setRoom] = useState<Room | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [channel, setChannel] = useState<RoomChannel | null>(null);
  const [members, setMembers] = useState<Record<string, Member>>({});
  const [links, setLinks] = useState<Record<Broker, boolean>>({ hivemq: false, mosquitto: false });
  const [playerOpen, setPlayerOpen] = useState(false);
  /** Last thing someone else did, for a short line in the room ("Tim hat umgeschaltet"). */
  const [event, setEvent] = useState<string | null>(null);
  const channelRef = useRef<RoomChannel | null>(null);
  const playerRef = useRef(false);
  /** Right after joining, the room's channel opens the player once. */
  const openOnState = useRef(false);
  const nameRef = useRef(name);
  nameRef.current = name;

  const openPlayer = (login: string, reload = false) => {
    if (!watch) return;
    playerRef.current = true;
    setPlayerOpen(true);
    void watch.player(login, reload).catch(() => {
      playerRef.current = false;
      setPlayerOpen(false);
    });
  };

  // Messages of the room.
  useEffect(() => {
    if (!watch || !room) return;
    const api = watch;
    const seen = new Set<string>();
    /** Members already greeted; someone new gets a hello back at once, to see who is here. */
    const known = new Set<string>();
    const heard = (id: string, who: string) =>
      setMembers((list) => ({ ...list, [id]: { name: who, seen: Date.now() } }));
    const stops = [
      api.onMessage(room, (message: WatchMessage, raw) => {
        // The same message arrives over both brokers.
        if (seen.has(raw)) return;
        seen.add(raw);
        if (seen.size > 500) seen.clear();
        if (message.id === me) return;
        switch (message.t) {
          case 'state': {
            heard(message.id, message.name);
            const now = channelRef.current;
            // Two switches at the same moment: the higher member id wins everywhere alike.
            const newer =
              !now || message.seq > now.seq || (message.seq === now.seq && message.id > now.id);
            if (!newer) return;
            const next = {
              login: message.channel,
              display: message.display,
              by: message.name,
              seq: message.seq,
              id: message.id,
            };
            const changed = now?.login !== next.login;
            channelRef.current = next;
            setChannel(next);
            if (changed && now) setEvent(`${message.name} hat auf ${message.display} umgeschaltet`);
            if (openOnState.current || (changed && playerRef.current)) {
              openOnState.current = false;
              openPlayer(next.login);
            }
            return;
          }
          case 'here':
            if (!known.has(message.id)) {
              known.add(message.id);
              void api.send(room, { t: 'here', id: me, name: nameRef.current }).catch(() => {});
            }
            heard(message.id, message.name);
            return;
          case 'bye':
            known.delete(message.id);
            setMembers((list) => {
              const rest = { ...list };
              delete rest[message.id];
              return rest;
            });
            return;
          case 'sync':
            heard(message.id, message.name);
            setEvent(`${message.name} hat neu synchronisiert`);
            if (playerRef.current && channelRef.current) openPlayer(channelRef.current.login, true);
            return;
        }
      }),
      api.onLink(({ broker, up }) => setLinks((l) => ({ ...l, [broker]: up }))),
      api.onPlayerClosed(() => {
        playerRef.current = false;
        setPlayerOpen(false);
      }),
    ];
    // A sign of life now and every minute; forget who went quiet.
    const hello = () =>
      void api.send(room, { t: 'here', id: me, name: nameRef.current }).catch(() => {});
    const timer = window.setInterval(() => {
      hello();
      setMembers((list) =>
        Object.fromEntries(
          Object.entries(list).filter(([id, m]) => {
            const here = Date.now() - m.seen < GONE_AFTER_MS;
            // Coming back later, they get a hello again (deleting twice does no harm).
            if (!here) known.delete(id);
            return here;
          }),
        ),
      );
    }, HERE_EVERY_MS);
    return () => {
      window.clearInterval(timer);
      stops.forEach((stop) => stop());
    };
  }, [room, me]);

  // Say hello as soon as the first broker is connected.
  const connected = brokers.some((b) => links[b]);
  useEffect(() => {
    if (watch && room && connected)
      void watch.send(room, { t: 'here', id: me, name: nameRef.current }).catch(() => {});
  }, [room, connected, me]);

  async function enter(secret: string, who: string) {
    if (!watch) return;
    setBusy(true);
    setError(null);
    try {
      const next = await openRoom(secret);
      await watch.join(next, me);
      remember(who, next.code);
      nameRef.current = who;
      channelRef.current = null;
      openOnState.current = true;
      setChannel(null);
      setMembers({});
      setEvent(null);
      setLinks({ hivemq: false, mosquitto: false });
      setRoom(next);
    } catch {
      setError('Raum konnte nicht geöffnet werden.');
    } finally {
      setBusy(false);
    }
  }

  if (!watch) return null;
  const api = watch;
  const others = Object.entries(members).filter(([id]) => id !== me);
  return {
    /** This participant's id (a channel switched by oneself carries it). */
    me,
    room,
    busy,
    error,
    channel,
    members: others.map(([id, m]) => ({ id, name: m.name })),
    /** Connected to at least one broker; `linked` counts them. */
    connected,
    linked: brokers.filter((b) => links[b]).length,
    playerOpen,
    event,
    /** The last room's code, if it can be joined again (not while in it). */
    lastRoom: lastRoom && parseRoomCode(lastRoom) !== 'typo' && !room ? lastRoom : null,
    /** A new room with a fresh code. */
    create: (who: string) => enter(newRoomSecret(), cleanName(who)),
    /** Joins by code; false: the code has a typo or is incomplete. */
    join(code: string, who: string) {
      const secret = parseRoomCode(code);
      if (secret === null || secret === 'typo') return false;
      void enter(secret, cleanName(who));
      return true;
    },
    /** Everyone switches to this channel. */
    switchTo(login: string, display: string) {
      if (!room) return;
      const seq = (channelRef.current?.seq ?? 0) + 1;
      const who = nameRef.current;
      const next = { login, display: cleanName(display) || login, by: who, seq, id: me };
      channelRef.current = next;
      setChannel(next);
      setEvent(null);
      openOnState.current = false;
      openPlayer(login);
      void api
        .send(
          room,
          { t: 'state', id: me, name: who, channel: login, display: next.display, seq },
          true,
        )
        .catch(() => setError('Umschalten konnte nicht gesendet werden.'));
    },
    /** Everyone starts the stream anew, back at the live edge. */
    resync() {
      if (!room || !channelRef.current) return;
      openPlayer(channelRef.current.login, true);
      setEvent(null);
      void api.send(room, { t: 'sync', id: me, name: nameRef.current }).catch(() => {});
    },
    openPlayer: () => channelRef.current && openPlayer(channelRef.current.login),
    closePlayer: () => void api.closePlayer(),
    async leave() {
      if (!room) return;
      const alone = others.length === 0;
      await api.send(room, { t: 'bye', id: me }).catch(() => {});
      await api.leave(alone).catch(() => {});
      channelRef.current = null;
      playerRef.current = false;
      setRoom(null);
      setChannel(null);
      setMembers({});
      setPlayerOpen(false);
      setEvent(null);
    },
  };
}
