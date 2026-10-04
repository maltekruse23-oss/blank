CREATE TABLE `snapshots` (
	`key` text PRIMARY KEY NOT NULL,
	`version` integer NOT NULL,
	`cursor` integer NOT NULL,
	`at` integer NOT NULL,
	`json` text NOT NULL
);
