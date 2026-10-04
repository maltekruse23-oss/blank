import { sqliteTable, text, integer, real, primaryKey, index } from 'drizzle-orm/sqlite-core';
export const games = sqliteTable('games', { gameId: integer('gameId').notNull(), puuid: text('puuid').notNull(), name: text('name').notNull(), at: integer('at').notNull(), quality: real('quality').notNull(), receivedAt: integer('receivedAt').notNull(), sourceHash: text('sourceHash').notNull(), json: text('json').notNull(), disputed: integer('disputed').notNull().default(0) }, t => [primaryKey({ columns: [t.gameId, t.puuid] }), index('games_player_time').on(t.puuid, t.at), index('games_time').on(t.at)]);
export const players = sqliteTable('players', { puuid: text('puuid').primaryKey(), name: text('name').notNull(), icon: integer('icon').notNull(), lastSeen: integer('lastSeen').notNull(), tokenHash: text('tokenHash') });
export const groups = sqliteTable('groups', { code: text('code').primaryKey(), name: text('name').notNull(), since: integer('since').notNull(), createdAt: integer('createdAt').notNull(), adminHash: text('adminHash').notNull() });
export const members = sqliteTable('group_members', { code: text('code').notNull(), puuid: text('puuid').notNull() }, t => [primaryKey({ columns: [t.code, t.puuid] })]);
export const seasons = sqliteTable('seasons', { id: text('id').primaryKey(), start: integer('start').notNull(), ratingVersion: integer('ratingVersion').notNull() });
export const reports = sqliteTable('reports', { gameId: integer('gameId').notNull(), uploader: text('uploader').notNull(), quality: real('quality').notNull(), lobbyHash: text('lobbyHash').notNull() }, t => [primaryKey({ columns: [t.gameId, t.uploader] })]);
// Only one-minute, irreversible keyed identifiers, never raw IPs.
export const rateLimits = sqliteTable('rate_limits', { key: text('key').primaryKey(), expires: integer('expires').notNull(), count: integer('count').notNull() }, t => [index('rate_expiry').on(t.expires)]);
export const events = sqliteTable('events', { id: integer('id').primaryKey({ autoIncrement: true }), gameId: integer('gameId'), puuid: text('puuid'), kind: text('kind').notNull(), at: integer('at').notNull() }, t => [index('events_at').on(t.at)]);

// Additive raw archive. The original ratings and player authentication stay separate.
export const archiveCollectors = sqliteTable('archive_collectors', {
  id: text('id').primaryKey(),
  tokenHash: text('tokenHash').notNull().unique(),
  label: text('label').notNull(),
  createdAt: integer('createdAt').notNull(),
  revokedAt: integer('revokedAt'),
  requests: integer('requests').notNull().default(0),
  day: integer('day').notNull().default(0),
});

export const archiveMatches = sqliteTable('archive_matches', {
    matchKey: text('matchKey').primaryKey(), platformId: text('platformId').notNull(),
    gameId: integer('gameId').notNull(), queueId: integer('queueId').notNull(),
    gameCreation: integer('gameCreation').notNull(), gameDuration: integer('gameDuration').notNull(),
    gameVersion: text('gameVersion').notNull(), detailsHash: text('detailsHash').notNull(),
    timelineHash: text('timelineHash'), receivedAt: integer('receivedAt').notNull(),
}, t => [index('archive_matches_time').on(t.gameCreation)]);
export const archivePlayers = sqliteTable('archive_players', {
    id: integer('id').primaryKey({ autoIncrement: true }), puuid: text('puuid').notNull().unique(),
});
export const archiveParticipants = sqliteTable('archive_participants', {
    matchKey: text('matchKey').notNull().references(() => archiveMatches.matchKey),
    participantId: integer('participantId').notNull(),
    playerId: integer('playerId').notNull().references(() => archivePlayers.id),
    teamId: integer('teamId').notNull(), championId: integer('championId').notNull(),
}, t => [primaryKey({ columns: [t.matchKey, t.participantId] }), index('archive_player_matches').on(t.playerId, t.matchKey)]);
export const archiveRevisions = sqliteTable('archive_revisions', {
    matchKey: text('matchKey').notNull().references(() => archiveMatches.matchKey),
    kind: text('kind').notNull(), sha256: text('sha256').notNull(), objectKey: text('objectKey').notNull(),
    rawBytes: integer('rawBytes').notNull(), gzipBytes: integer('gzipBytes').notNull(),
    capturedAt: integer('capturedAt').notNull(), receivedAt: integer('receivedAt').notNull(),
    source: text('source').notNull(), collectorVersion: text('collectorVersion').notNull(),
    validationVersion: integer('validationVersion').notNull(),
}, t => [primaryKey({ columns: [t.matchKey, t.kind, t.sha256] }), index('archive_revisions_received').on(t.receivedAt)]);

// Names and small icons of augments, sent by blank. from the League client (the only source:
// Data Dragon has no Mayhem augments). Game data, no personal data; the first complete value stays.
export const augments = sqliteTable('augments', {
    id: integer('id').primaryKey(), name: text('name').notNull(), rarity: text('rarity').notNull(),
    icon: text('icon'), receivedAt: integer('receivedAt').notNull(),
});

// Players without a profile who asked not to be named (/datenschutz/entfernen): only the PUUID,
// never the name, so a new Riot ID stays hidden too.
export const hiddenPlayers = sqliteTable('hidden_players', { puuid: text('puuid').primaryKey(), at: integer('at').notNull() });

// Stored results of the reading pages (src/snapshot.ts): computed once, valid until the next event
// or for five minutes. Only what the pages show anyway, so never more than the API gives out.
export const snapshots = sqliteTable('snapshots', { key: text('key').primaryKey(), version: integer('version').notNull(), cursor: integer('cursor').notNull(), at: integer('at').notNull(), json: text('json').notNull() });

// Every player of an archived game as an entry (src/archive-entries.ts), so players without a
// profile get grades, ranks and a profile too. Built from the archive on upload and, for older
// games, a few at a time while the pages are read; rebuilt when ARCHIVE_ENTRY_VERSION changes.
export const archiveEntries = sqliteTable('archive_entries', {
    matchKey: text('matchKey').notNull().references(() => archiveMatches.matchKey),
    playerId: integer('playerId').notNull().references(() => archivePlayers.id),
    gameId: integer('gameId').notNull(), at: integer('at').notNull(),
    /** Riot ID at the time of the game and its search form (src/hidden.ts, riotKey). */
    name: text('name'), search: text('search'), icon: integer('icon'), json: text('json').notNull(),
}, t => [primaryKey({ columns: [t.matchKey, t.playerId] }), index('archive_entries_player').on(t.playerId, t.at),
    index('archive_entries_time').on(t.at), index('archive_entries_search').on(t.search)]);
/** Which archived games have their entries (ok = 0: the stored answer could not be read). */
export const archiveIndexed = sqliteTable('archive_indexed', {
    matchKey: text('matchKey').primaryKey().references(() => archiveMatches.matchKey),
    version: integer('version').notNull(), ok: integer('ok').notNull(), at: integer('at').notNull(),
});
