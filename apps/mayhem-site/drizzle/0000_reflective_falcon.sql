CREATE TABLE `events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`gameId` integer,
	`puuid` text,
	`kind` text NOT NULL,
	`at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `events_at` ON `events` (`at`);--> statement-breakpoint
CREATE TABLE `games` (
	`gameId` integer NOT NULL,
	`puuid` text NOT NULL,
	`name` text NOT NULL,
	`at` integer NOT NULL,
	`quality` real NOT NULL,
	`receivedAt` integer NOT NULL,
	`sourceHash` text NOT NULL,
	`json` text NOT NULL,
	`disputed` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`gameId`, `puuid`)
);
--> statement-breakpoint
CREATE INDEX `games_player_time` ON `games` (`puuid`,`at`);--> statement-breakpoint
CREATE INDEX `games_time` ON `games` (`at`);--> statement-breakpoint
CREATE TABLE `groups` (
	`code` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`since` integer NOT NULL,
	`createdAt` integer NOT NULL,
	`adminHash` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `group_members` (
	`code` text NOT NULL,
	`puuid` text NOT NULL,
	PRIMARY KEY(`code`, `puuid`)
);
--> statement-breakpoint
CREATE TABLE `players` (
	`puuid` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`icon` integer NOT NULL,
	`lastSeen` integer NOT NULL,
	`tokenHash` text
);
--> statement-breakpoint
CREATE TABLE `rate_limits` (
	`key` text PRIMARY KEY NOT NULL,
	`expires` integer NOT NULL,
	`count` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `rate_expiry` ON `rate_limits` (`expires`);--> statement-breakpoint
CREATE TABLE `reports` (
	`gameId` integer NOT NULL,
	`uploader` text NOT NULL,
	`quality` real NOT NULL,
	`lobbyHash` text NOT NULL,
	PRIMARY KEY(`gameId`, `uploader`)
);
--> statement-breakpoint
CREATE TABLE `seasons` (
	`id` text PRIMARY KEY NOT NULL,
	`start` integer NOT NULL,
	`ratingVersion` integer NOT NULL
);
