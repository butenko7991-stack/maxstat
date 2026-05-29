CREATE TABLE `channel_subscriber_snapshots` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`channelId` int NOT NULL,
	`subscriberCount` bigint NOT NULL,
	`snapshotDate` timestamp NOT NULL,
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `channel_subscriber_snapshots_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `purchase_records` ADD `sourceSubscribers` bigint;--> statement-breakpoint
ALTER TABLE `sale_records` ADD `buyerSubscribers` bigint;