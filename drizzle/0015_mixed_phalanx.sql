ALTER TABLE `users` ADD `passwordHash` varchar(255);--> statement-breakpoint
ALTER TABLE `purchase_records` DROP COLUMN `botStories`;--> statement-breakpoint
ALTER TABLE `purchase_records` DROP COLUMN `botStoriesCost`;--> statement-breakpoint
ALTER TABLE `sale_records` DROP COLUMN `botStories`;--> statement-breakpoint
ALTER TABLE `sale_records` DROP COLUMN `botStoriesCost`;