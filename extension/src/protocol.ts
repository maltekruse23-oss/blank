// Between the small window of the extension (popup.ts) and its background (background.ts).

/** What the popup may ask for; `tab`: the tab that was active when it was opened. */
export type Command =
  | { cmd: 'create'; name: string; tab: number | null }
  | { cmd: 'join'; code: string; name: string; tab: number | null }
  | { cmd: 'leave' }
  | { cmd: 'resync' }
  | { cmd: 'useTab'; tab: number };

/** What the popup shows; the background keeps it in storage.session under VIEW. */
export type View = {
  busy: boolean;
  error: string | null;
  room: {
    code: string;
    /** The others in the room. */
    members: string[];
    channel: { login: string; display: string; by: string } | null;
    /** Brokers connected (of two). */
    linked: number;
    /** Last thing someone else did ("Tim hat auf xqc umgeschaltet"). */
    event: string | null;
    /** The Twitch tab that follows the room; null: none yet, one opens at the next switch. */
    tab: number | null;
  } | null;
};

export const VIEW = 'view';
/** Kept on this PC: the name and the last room (offered as "Wieder beitreten", never joined). */
export const NAME = 'name';
export const LAST_ROOM = 'lastRoom';
