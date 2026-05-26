ALTER TABLE `sale_records` ADD `isMutual` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `sale_records` ADD `partnerChannel` varchar(255);--> statement-breakpoint
ALTER TABLE `sale_records` ADD `ourReach` bigint;--> statement-breakpoint
ALTER TABLE `sale_records` ADD `partnerReach` bigint;--> statement-breakpoint
ALTER TABLE `sale_records` ADD `dopDirection` enum('we_pay','they_pay','none') DEFAULT 'none';--> statement-breakpoint
ALTER TABLE `sale_records` ADD `dopAmount` decimal(12,2);