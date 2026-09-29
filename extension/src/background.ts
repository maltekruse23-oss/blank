// Watch together in the own browser: the room lives here, in the extension's background. It
// speaks exactly like blank. (src/adapters/watchRoom.ts, src-tauri/src/watch.rs): same code,
// topic, key, messages and brokers, so the browser and the app meet in the same rooms. One
// Twitch tab follows the room: switching the channel in it switches for everyone, and a switch
// by someone else loads the channel there. Only the tab's address is read, nothing of the page.
import {
  brokers,
  cleanName,
  newMemberId,
  newRoomSecret,
  openMessage,
  openRoom,
  parseRoomCode,
  sealMessage,
  type Broker,
  type Room,
  type WatchMessage,
} from '../../src/adapters/watchRoom';
import { channelOfUrl, channelUrl, isTwitchUrl } from './channel';
import { BrokerLink } from './mqtt';
import { LAST_ROOM, NAME, VIEW, type Command, type View } from './protocol';

/** The same two public brokers as the app (watch.rs `BROKERS`). */
const ADDRESSES: Record<Broker, string> = {
  hivemq: 'wss://broker.hivemq.com:8884/mqtt',
  mosquitto: 'wss://test.mosquitto.org:8081/mqtt',
};
/** Presence: a sign of life every minute; who was not heard from for 2.5 minutes is gone. */
const HERE_EVERY_MS = 60_000;
const GONE_AFTER_MS = 150_000;
/** Joining an empty room: after this long without a channel, the tab's channel becomes it. */
const ADOPT_AFTER_MS = 3_000;
/** Addresses the extension loaded itself are not taken as the user's own switch for so long. */
const OWN_LOAD_MS = 10_000;
/** In storage.session: the room, so it goes on when the browser pauses the background. */
const SAVED = 'room';

type Channel = { login: string; display: string; by: string; seq: number; id: string };
type Saved = {
  secret: string;
  me: string;
  name: string;
  tab: number | null;
  channel: Channel | null;
};
type Active = Saved & {
  room: Room;
  links: BrokerLink[];
  /** The same message arrives over both brokers. */
  seen: Set<string>;
  /** Members already greeted; someone new gets a hello back at once. */
  known: Set<string>;
  members: Map<string, { name: string; seen: number }>;
  event: string | null;
  timer: ReturnType<typeof setInterval>;
  /** Right after joining, the room's channel is loaded once. */
  loadOnState: boolean;
  /** Channels the extension loaded itself, with the time. */
  loaded: Map<string, number>;
};

let active: Active | null = null;
let busy = false;
let error: string | null = null;

// --- What the popup and the icon show ---

function render() {
  const a = active;
  const view: View = {
    busy,
    error,
    room: a && {
      code: a.room.code,
      members: [...a.members.values()].map((m) => m.name),
      channel: a.channel && {
        login: a.channel.login,
        display: a.channel.display,
        by: a.channel.by,
      },
      linked: a.links.filter((l) => l.connected).length,
      event: a.event,
      tab: a.tab,
    },
  };
  void chrome.storage.session.set({ [VIEW]: view });
  if (a) {
    const saved: Saved = {
      secret: a.secret,
      me: a.me,
      name: a.name,
      tab: a.tab,
      channel: a.channel,
    };
    void chrome.storage.session.set({ [SAVED]: saved });
  }
  const people = a ? a.members.size + 1 : 0;
  void chrome.action.setBadgeText({ text: a ? String(people) : '' });
  void chrome.action.setTitle({
    title: a
      ? `blank. Zusammen schauen · ${people === 1 ? '1 Person' : `${people} Personen`}`
      : 'blank. Zusammen schauen',
  });
}

void chrome.action.setBadgeBackgroundColor({ color: '#afd58c' });
void chrome.action.setBadgeTextColor({ color: '#182114' });

// --- The room ---

async function send(a: Active, message: WatchMessage, keep = false) {
  const data = await sealMessage(message, a.room.key);
  a.links.forEach((link) => link.publish(data, keep));
}

const hello = (a: Active) => void send(a, { t: 'here', id: a.me, name: a.name });

/** Shows a channel in the room's tab; opens a tab if there is none (or it left Twitch). */
async function load(a: Active, login: string, reload = false) {
  a.loaded.set(login, Date.now());
  if (a.tab !== null) {
    const tab = await chrome.tabs.get(a.tab).catch(() => null);
    // A tab that went elsewhere belongs to the user again.
    if (tab && isTwitchUrl(tab.url)) {
      if (channelOfUrl(tab.url) !== login)
        await chrome.tabs.update(a.tab, { url: channelUrl(login) });
      else if (reload) await chrome.tabs.reload(a.tab);
      return;
    }
  }
  const tab = await chrome.tabs.create({ url: channelUrl(login), active: true });
  if (active === a) {
    a.tab = tab.id ?? null;
    render();
  }
}

/** Everyone switches to this channel (the user switched in the room's tab). */
function switchTo(a: Active, login: string) {
  const seq = (a.channel?.seq ?? 0) + 1;
  // No Twitch API here: the login is the name shown.
  a.channel = { login, display: cleanName(login), by: a.name, seq, id: a.me };
  a.event = null;
  a.loadOnState = false;
  void send(
    a,
    { t: 'state', id: a.me, name: a.name, channel: login, display: a.channel.display, seq },
    true,
  );
  render();
}

async function receive(a: Active, payload: string) {
  if (active !== a || a.seen.has(payload)) return;
  a.seen.add(payload);
  if (a.seen.size > 500) a.seen.clear();
  const message = await openMessage(payload, a.room.key);
  if (!message || message.id === a.me || active !== a) return;
  const heard = (name: string) => a.members.set(message.id, { name, seen: Date.now() });
  switch (message.t) {
    case 'state': {
      heard(message.name);
      const now = a.channel;
      // Two switches at the same moment: the higher member id wins everywhere alike.
      const newer =
        !now || message.seq > now.seq || (message.seq === now.seq && message.id > now.id);
      if (newer) {
        const changed = now?.login !== message.channel;
        a.channel = {
          login: message.channel,
          display: message.display,
          by: message.name,
          seq: message.seq,
          id: message.id,
        };
        if (changed && now) a.event = `${message.name} hat auf ${message.display} umgeschaltet`;
        if (changed || a.loadOnState) void load(a, message.channel);
        a.loadOnState = false;
      }
      break;
    }
    case 'here':
      if (!a.known.has(message.id)) {
        a.known.add(message.id);
        hello(a);
      }
      heard(message.name);
      break;
    case 'bye':
      a.known.delete(message.id);
      a.members.delete(message.id);
      break;
    case 'sync':
      heard(message.name);
      a.event = `${message.name} hat neu synchronisiert`;
      if (a.channel) void load(a, a.channel.login, true);
      break;
  }
  render();
}

async function enter(secret: string, name: string, tab: number | null, resume?: Saved) {
  if (active) await leave();
  const room = await openRoom(secret);
  const me = resume?.me ?? newMemberId();
  const a: Active = {
    secret,
    me,
    name,
    tab,
    channel: resume?.channel ?? null,
    room,
    links: [],
    seen: new Set(),
    known: new Set(),
    members: new Map(),
    event: null,
    timer: setInterval(() => {
      hello(a);
      for (const [id, member] of a.members)
        if (Date.now() - member.seen >= GONE_AFTER_MS) {
          a.members.delete(id);
          a.known.delete(id);
        }
      render();
    }, HERE_EVERY_MS),
    loadOnState: !resume,
    loaded: new Map(),
  };
  let adopt = !resume;
  a.links = brokers.map(
    (broker) =>
      new BrokerLink(ADDRESSES[broker], room.topic, `blank-${me}`, {
        message: (payload) => void receive(a, payload),
        link: (up) => {
          if (active !== a) return;
          if (up) hello(a);
          // An empty room takes the channel the tab shows.
          if (up && adopt) {
            adopt = false;
            setTimeout(() => void adoptTab(a), ADOPT_AFTER_MS);
          }
          render();
        },
      }),
  );
  active = a;
  await chrome.storage.local.set({ [NAME]: name, [LAST_ROOM]: room.code });
  render();
}

async function adoptTab(a: Active) {
  if (active !== a || a.channel || a.tab === null) return;
  const tab = await chrome.tabs.get(a.tab).catch(() => null);
  const login = channelOfUrl(tab?.url);
  if (login && active === a && !a.channel) switchTo(a, login);
}

async function leave() {
  const a = active;
  if (!a) return;
  active = null;
  clearInterval(a.timer);
  await send(a, { t: 'bye', id: a.me }).catch(() => undefined);
  // Nobody else here: the brokers forget the room's channel.
  if (a.members.size === 0) a.links.forEach((link) => link.publish('', true));
  a.links.forEach((link) => link.close());
  await chrome.storage.session.remove(SAVED);
  render();
}

/** Only a Twitch tab follows the room. */
async function twitchTab(id: number | null) {
  if (id === null) return null;
  const tab = await chrome.tabs.get(id).catch(() => null);
  return tab && isTwitchUrl(tab.url) ? id : null;
}

async function handle(command: Command) {
  const a = active;
  switch (command.cmd) {
    case 'create':
    case 'join': {
      const name = cleanName(command.name);
      const secret = command.cmd === 'create' ? newRoomSecret() : parseRoomCode(command.code);
      if (!name) throw new Error('Bitte gib einen Namen ein.');
      if (secret === null) throw new Error('Der Code ist noch nicht vollständig.');
      if (secret === 'typo') throw new Error('Im Code ist ein Tippfehler.');
      await enter(secret, name, await twitchTab(command.tab));
      return;
    }
    case 'leave':
      return leave();
    case 'resync':
      if (!a?.channel) return;
      a.event = null;
      void send(a, { t: 'sync', id: a.me, name: a.name });
      await load(a, a.channel.login, true);
      render();
      return;
    case 'useTab':
      if (!a || (await twitchTab(command.tab)) === null) return;
      a.tab = command.tab;
      if (a.channel) await load(a, a.channel.login);
      else void adoptTab(a);
      render();
      return;
  }
}

chrome.runtime.onMessage.addListener((message, _sender, reply) => {
  busy = true;
  error = null;
  render();
  handle(message as Command)
    .catch((e: unknown) => {
      error = e instanceof Error ? e.message : 'Raum konnte nicht geöffnet werden.';
    })
    .finally(() => {
      busy = false;
      render();
      reply(null);
    });
  return true;
});

// --- The room's tab ---

chrome.tabs.onUpdated.addListener((id, change) => {
  const a = active;
  if (!a || id !== a.tab || !change.url) return;
  const login = channelOfUrl(change.url);
  if (!login || login === a.channel?.login) return;
  // Loaded by the extension a moment ago (a later switch overtook it): not the user's switch.
  const loadedAt = a.loaded.get(login);
  if (loadedAt !== undefined && Date.now() - loadedAt < OWN_LOAD_MS) return;
  switchTo(a, login);
});

chrome.tabs.onRemoved.addListener((id) => {
  if (active && id === active.tab) {
    active.tab = null;
    render();
  }
});

// --- Start of the background (also after the browser paused it) ---

function readSaved(raw: unknown): Saved | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const s = raw as Saved;
  return typeof s.secret === 'string' &&
    typeof s.me === 'string' &&
    typeof s.name === 'string' &&
    (s.tab === null || typeof s.tab === 'number')
    ? s
    : null;
}

void chrome.storage.session.get(SAVED).then(async (items) => {
  const saved = readSaved(items[SAVED]);
  if (saved && !active) await enter(saved.secret, saved.name, saved.tab, saved).catch(() => {});
  render();
});
