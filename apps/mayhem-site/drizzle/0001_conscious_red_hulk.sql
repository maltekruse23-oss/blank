CREATE TABLE `archive_matches` (
	`matchKey` text PRIMARY KEY NOT NULL,
	`platformId` text NOT NULL,
	`gameId` integer NOT NULL,
	`queueId` integer NOT NULL,
	`gameCreation` integer NOT NULL,
	`gameDuration` integer NOT NULL,
	`gameVersion` text NOT NULL,
	`detailsHash` text NOT NULL,
	`timelineHash` text,
	`receivedAt` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `archive_matches_time` ON `archive_matches` (`gameCreation`);--> statement-breakpoint
CREATE TABLE `archive_participants` (
	`matchKey` text NOT NULL,
	`participantId` integer NOT NULL,
	`playerId` integer NOT NULL,
	`teamId` integer NOT NULL,
	`championId` integer NOT NULL,
	PRIMARY KEY(`matchKey`, `participantId`),
	FOREIGN KEY (`matchKey`) REFERENCES `archive_matches`(`matchKey`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`playerId`) REFERENCES `archive_players`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `archive_player_matches` ON `archive_participants` (`playerId`,`matchKey`);--> statement-breakpoint
CREATE TABLE `archive_players` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`puuid` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `archive_players_puuid_unique` ON `archive_players` (`puuid`);--> statement-breakpoint
CREATE TABLE `archive_revisions` (
	`matchKey` text NOT NULL,
	`kind` text NOT NULL,
	`sha256` text NOT NULL,
	`objectKey` text NOT NULL,
	`rawBytes` integer NOT NULL,
	`gzipBytes` integer NOT NULL,
	`capturedAt` integer NOT NULL,
	`receivedAt` integer NOT NULL,
	`source` text NOT NULL,
	`collectorVersion` text NOT NULL,
	`validationVersion` integer NOT NULL,
	PRIMARY KEY(`matchKey`, `kind`, `sha256`),
	FOREIGN KEY (`matchKey`) REFERENCES `archive_matches`(`matchKey`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `archive_revisions_received` ON `archive_revisions` (`receivedAt`);