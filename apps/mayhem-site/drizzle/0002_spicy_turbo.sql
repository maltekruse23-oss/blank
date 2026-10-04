CREATE TABLE `archive_collectors` (
	`id` text PRIMARY KEY NOT NULL,
	`tokenHash` text NOT NULL,
	`label` text NOT NULL,
	`createdAt` integer NOT NULL,
	`revokedAt` integer,
	`requests` integer DEFAULT 0 NOT NULL,
	`day` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `archive_collectors_tokenHash_unique` ON `archive_collectors` (`tokenHash`);