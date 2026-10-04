import { z } from 'zod';

export const MAX_RAW_BYTES = 2 * 1024 * 1024;
export const platform = z.string().regex(/^[A-Z][A-Z0-9]{1,7}$/);
const id = z.number().int().positive().safe();
const puuid = z.string().regex(/^[A-Za-z0-9_-]{20,128}$/);
const identity = z.object({ participantId: id, player: z.object({ puuid }).passthrough() }).passthrough();
const participant = z.object({ participantId: id, teamId: z.union([z.literal(100), z.literal(200)]),
    championId: id, stats: z.object({ win: z.boolean() }).passthrough() }).passthrough();
const match = z.object({ gameId: id, platformId: platform, queueId: z.literal(2400),
    gameCreation: id, gameDuration: id, gameVersion: z.string().min(1).max(100),
    participantIdentities: z.array(identity).length(10), participants: z.array(participant).length(10),
}).passthrough();

export function validateMatch(value: unknown) {
    const game = match.parse(value);
    const identities = new Map(game.participantIdentities.map(p => [p.participantId, p.player.puuid]));
    if (identities.size !== 10 || new Set(identities.values()).size !== 10 ||
        new Set(game.participants.map(p => p.participantId)).size !== 10 ||
        game.participants.some(p => !identities.has(p.participantId)) ||
        game.participants.filter(p => p.teamId === 100).length !== 5) {
        throw new Error('Zehn eindeutige Teilnehmer und zwei vollständige Teams erforderlich');
    }
    return { game, matchKey: `${game.platformId}_${game.gameId}`, participants: game.participants.map(p => ({
        participantId: p.participantId, puuid: identities.get(p.participantId)!, teamId: p.teamId, championId: p.championId,
    })) };
}

// The LCU timeline has no match ID: pairing remains an authenticated collector assertion.
export function validateTimeline(value: unknown) {
    return z.object({ frameInterval: id.optional(), frames: z.array(z.object({
        timestamp: z.number().int().nonnegative(), participantFrames: z.record(z.string(), z.unknown()),
        events: z.array(z.unknown()),
    }).passthrough()).min(1) }).passthrough().parse(value);
}
