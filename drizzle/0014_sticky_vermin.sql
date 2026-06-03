ALTER TABLE `purchase_records` ADD `isMutual` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `purchase_records` ADD `partnerChannel` varchar(255);