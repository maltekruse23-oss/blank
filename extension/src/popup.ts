// The small window of the extension: start or join a room; in the room, who is there, the
// channel and the tab that follows it. Everything else happens in the background.
import { parseRoomCode } from '../../src/adapters/watchRoom';
import { isTwitchUrl } from './channel';
import { LAST_ROOM, NAME, VIEW, type Command, type View } from './protocol';

const main = document.getElementById('main')!;
let view: View = { busy: false, error: null, room: null };
let shown: 'lobby' | 'room' | null = null;
/** The tab that was active when the window opened. */
let current: chrome.tabs.Tab | null = null;

type Child = Node | string | null | false;
function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]> & { class?: string } = {},
  ...children: Child[]
) {
  const el = document.createElement(tag);
  const { class: className, ...rest } = props;
  if (className) el.className = className;
  Object.assign(el, rest);
  for (const child of children) if (child) el.append(child);
  return el;
}

const fill = (...children: Child[]) =>
  main.replaceChildren(...children.filter((c): c is Node | string => !!c));
const send = (command: Command) => void chrome.runtime.sendMessage(command);
const tabId = () => current?.id ?? null;

// --- Not in a room ---

const lobby = {
  name: h('input', { placeholder: 'Dein Name', maxLength: 24, ariaLabel: 'Dein Name im Raum' }),
  code: h('input', {
    placeholder: 'Raum-Code',
    ariaLabel: 'Raum-Code',
    spellcheck: false,
  }),
  create: h('button', { class: 'primary', textContent: 'Raum starten' }),
  join: h('button', { textContent: 'Beitreten' }),
  again: h('button', { class: 'link' }),
  message: h('p', { class: 'message', role: 'status' }),
};

function showLobby(lastRoom: string | null) {
  const hint = isTwitchUrl(current?.url)
    ? 'Dieser Tab folgt dem Raum.'
    : 'Ein Twitch-Tab öffnet sich beim ersten Umschalten.';
  lobby.again.textContent = lastRoom ? `Wieder beitreten: ${lastRoom}` : '';
  fill(
    h('label', { class: 'field' }, h('span', { textContent: 'Name' }), lobby.name),
    lobby.create,
    h('div', { class: 'or', textContent: 'oder' }),
    h('form', { class: 'row' }, lobby.code, lobby.join),
    lastRoom && lobby.again,
    lobby.message,
    h('p', { class: 'hint', textContent: hint }),
  );
}

const who = () => lobby.name.value.trim();

function joinWith(code: string) {
  const parsed = parseRoomCode(code);
  if (!who()) lobby.message.textContent = 'Bitte gib einen Namen ein.';
  else if (parsed === null) lobby.message.textContent = 'Der Code ist noch nicht vollständig.';
  else if (parsed === 'typo') lobby.message.textContent = 'Im Code ist ein Tippfehler.';
  else send({ cmd: 'join', code, name: who(), tab: tabId() });
}

lobby.create.onclick = () =>
  who()
    ? send({ cmd: 'create', name: who(), tab: tabId() })
    : (lobby.message.textContent = 'Bitte gib einen Namen ein.');
lobby.join.type = 'submit';
lobby.join.onclick = (event) => {
  event.preventDefault();
  joinWith(lobby.code.value);
};
lobby.again.onclick = () => joinWith(lobby.again.textContent!.replace('Wieder beitreten: ', ''));
lobby.name.oninput = () => void chrome.storage.local.set({ [NAME]: lobby.name.value });

// --- In a room ---

function showRoom(room: NonNullable<View['room']>) {
  const copy = h('button', { class: 'small', textContent: 'Kopieren' });
  copy.onclick = () =>
    void navigator.clipboard.writeText(room.code).then(() => (copy.textContent = 'Kopiert'));
  const people = room.members.length + 1;
  const tabShowsRoom = current?.id === room.tab;
  const canUseTab = !tabShowsRoom && isTwitchUrl(current?.url);
  const useTab = h('button', { class: 'small', textContent: 'Diesen Tab nutzen' });
  useTab.onclick = () => current?.id !== undefined && send({ cmd: 'useTab', tab: current.id });
  const resync = h('button', { textContent: 'Neu synchronisieren', disabled: !room.channel });
  resync.onclick = () => send({ cmd: 'resync' });
  const leave = h('button', { class: 'danger', textContent: 'Verlassen' });
  leave.onclick = () => send({ cmd: 'leave' });
  fill(
    h('div', { class: 'code' }, h('strong', { textContent: room.code }), copy),
    h(
      'p',
      { class: 'state' },
      h('span', { class: room.linked ? 'dot on' : 'dot' }),
      room.linked ? `Verbunden · ${people === 1 ? 'nur du' : `${people} im Raum`}` : 'Verbinde …',
    ),
    room.members.length > 0 &&
      h('p', { class: 'members', textContent: `Mit ${room.members.join(', ')}` }),
    h(
      'div',
      { class: 'channel' },
      room.channel
        ? h(
            'span',
            {},
            h('strong', { textContent: room.channel.display }),
            h('small', { textContent: ` · von ${room.channel.by}` }),
          )
        : h('span', { class: 'muted', textContent: 'Noch kein Kanal – wechsle im Tab zu einem.' }),
    ),
    room.event && h('p', { class: 'event', textContent: room.event }),
    h(
      'p',
      { class: 'hint' },
      room.tab === null
        ? 'Kein Tab – beim nächsten Umschalten öffnet sich einer.'
        : tabShowsRoom
          ? 'Dieser Tab folgt dem Raum. Wechselst du hier den Kanal, wechseln alle.'
          : 'Ein anderer Tab folgt dem Raum.',
    ),
    canUseTab && useTab,
    h('div', { class: 'row' }, resync, leave),
    view.error && h('p', { class: 'message', textContent: view.error }),
  );
}

// --- Drawing ---

async function draw() {
  const busy = view.busy;
  lobby.create.disabled = busy;
  lobby.join.disabled = busy;
  if (view.room) {
    shown = 'room';
    showRoom(view.room);
    return;
  }
  if (shown !== 'lobby') {
    shown = 'lobby';
    const stored = await chrome.storage.local.get([NAME, LAST_ROOM]);
    if (typeof stored[NAME] === 'string' && !lobby.name.value) lobby.name.value = stored[NAME];
    const last = stored[LAST_ROOM];
    showLobby(typeof last === 'string' && parseRoomCode(last) !== 'typo' ? last : null);
  }
  if (view.error) lobby.message.textContent = view.error;
  else if (busy) lobby.message.textContent = 'Öffne den Raum …';
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'session' || !changes[VIEW]?.newValue) return;
  view = changes[VIEW].newValue as View;
  void draw();
});

void (async () => {
  [current = null] = await chrome.tabs.query({ active: true, currentWindow: true });
  const stored = await chrome.storage.session.get(VIEW);
  if (stored[VIEW]) view = stored[VIEW] as View;
  await draw();
})();
