// Watch together (src-tauri/src/watch.rs carries the messages): a room is a random secret that
// exists only in the room code. From it come the topic on the brokers and the AES-GCM key
// (PBKDF2); everything is encrypted here, the brokers only ever see unreadable text. Desktop app
// only.
import { invoke, isTauri } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { openMessage, sealMessage, type Broker, type Room, type WatchMessage } from './watchRoom';

export * from './watchRoom';

export const watch = isTauri()
  ? {
      join: (room: Room, member: string) =>
        invoke<void>('watch_join', { topic: room.topic, client: member }),
      /** `keep`: the brokers keep it for people who join later (the current channel). */
      async send(room: Room, message: WatchMessage, keep = false) {
        const data = await sealMessage(message, room.key);
        await invoke<void>('watch_send', { data, retain: keep });
      },
      /** `clear`: nobody else is in the room; the brokers forget its channel. */
      leave: (clear: boolean) => invoke<void>('watch_leave', { clear }),
      /** Shows a channel in Twitch's player window; `reload`: start it anew (live edge). */
      player: (channel: string, reload = false) =>
        invoke<void>('watch_player', { channel, reload }),
      closePlayer: () => invoke<void>('watch_player_close'),
      /** Messages of the room, decrypted and checked; `raw` tells repeats apart. */
      onMessage(room: Room, handler: (message: WatchMessage, raw: string) => void) {
        const stop = listen<string>('watch-message', (event) => {
          void openMessage(event.payload, room.key).then((message) => {
            if (message) handler(message, event.payload);
          });
        });
        return () => void stop.then((unlisten) => unlisten());
      },
      onLink(handler: (link: { broker: Broker; up: boolean }) => void) {
        const stop = listen<{ broker: Broker; up: boolean }>('watch-link', (e) =>
          handler(e.payload),
        );
        return () => void stop.then((unlisten) => unlisten());
      },
      onPlayerClosed(handler: () => void) {
        const stop = listen('watch-player-closed', () => handler());
        return () => void stop.then((unlisten) => unlisten());
      },
    }
  : null;
