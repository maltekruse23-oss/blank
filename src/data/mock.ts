// Static demonstration data only. Never present these values as detected or live.
import type { GameRef, LiveStream, WatchedChannel } from '../adapters/twitch';

// Fictional category IDs; real Twitch IDs come from the Helix category search.
export const mockCategories: GameRef[] = [
  { id: 'mock-lol', name: 'League of Legends' },
  { id: 'mock-valorant', name: 'VALORANT' },
  { id: 'mock-chatting', name: 'Just Chatting' },
  { id: 'mock-minecraft', name: 'Minecraft' },
  { id: 'mock-cs', name: 'Counter-Strike' },
];
const [lol, valorant, chatting, minecraft, cs] = mockCategories;

// Fictional channels that the mock adapter can "find". stream = null means offline.
export const mockChannels: { login: string; displayName: string; stream: LiveStream | null }[] = [
  {
    login: 'forestbyte',
    displayName: 'forestbyte',
    stream: {
      login: 'forestbyte',
      title: 'Eine entspannte Runde auf der Botlane',
      game: lol,
      viewers: 1240,
      thumbnailUrl: null,
    },
  },
  {
    login: 'nightwave',
    displayName: 'nightwave',
    stream: {
      login: 'nightwave',
      title: 'Kaffee, Musik & ein bisschen Chaos',
      game: chatting,
      viewers: 836,
      thumbnailUrl: null,
    },
  },
  {
    login: 'pixelpilot',
    displayName: 'pixelpilot',
    stream: {
      login: 'pixelpilot',
      title: 'Zurück auf dem Server',
      game: valorant,
      viewers: 412,
      thumbnailUrl: null,
    },
  },
  { login: 'quietquest', displayName: 'quietquest', stream: null },
  {
    login: 'emberline',
    displayName: 'emberline',
    stream: {
      login: 'emberline',
      title: 'Neue Basis, alte Probleme',
      game: minecraft,
      viewers: 298,
      thumbnailUrl: null,
    },
  },
  {
    login: 'tidecaster',
    displayName: 'tidecaster',
    stream: {
      login: 'tidecaster',
      title: 'Premier mit dem Team',
      game: cs,
      viewers: 655,
      thumbnailUrl: null,
    },
  },
];

// Initial selection: nightwave only counts while playing League, so it stays hidden here.
export const defaultWatchlist: WatchedChannel[] = [
  { login: 'forestbyte', displayName: 'forestbyte', games: [] },
  { login: 'nightwave', displayName: 'nightwave', games: [lol] },
  { login: 'pixelpilot', displayName: 'pixelpilot', games: [valorant] },
  { login: 'quietquest', displayName: 'quietquest', games: [] },
];
