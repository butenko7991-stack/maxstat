ALTER TABLE `channel_subscriber_snapshots` ADD `views24h` int;--> statement-breakpoint
ALTER TABLE `channel_subscriber_snapshots` ADD `views48h` int;--> statement-breakpoint
ALTER TABLE `channel_subscriber_snapshots` ADD `views72h` int;--> statement-breakpoint
ALTER TABLE `channel_subscriber_snapshots` ADD `er24` decimal(6,2);--> statement-breakpoint
ALTER TABLE `channel_subscriber_snapshots` ADD `weeklyGrowth` int;