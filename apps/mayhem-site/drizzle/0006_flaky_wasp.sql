CREATE TABLE `archive_entries` (
	`matchKey` text NOT NULL,
	`playerId` integer NOT NULL,
	`gameId` integer NOT NULL,
	`at` integer NOT NULL,
	`name` text,
	`search` text,
	`icon` integer,
	`json` text NOT NULL,
	PRIMARY KEY(`matchKey`, `playerId`),
	FOREIGN KEY (`matchKey`) REFERENCES `archive_matches`(`matchKey`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`playerId`) REFERENCES `archive_players`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `archive_entries_player` ON `archive_entries` (`playerId`,`at`);--> statement-breakpoint
CREATE INDEX `archive_entries_time` ON `archive_entries` (`at`);--> statement-breakpoint
CREATE INDEX `archive_entries_search` ON `archive_entries` (`search`);--> statement-breakpoint
CREATE TABLE `archive_indexed` (
	`matchKey` text PRIMARY KEY NOT NULL,
	`version` integer NOT NULL,
	`ok` integer NOT NULL,
	`at` integer NOT NULL,
	FOREIGN KEY (`matchKey`) REFERENCES `archive_matches`(`matchKey`) ON UPDATE no action ON DELETE no action
);
