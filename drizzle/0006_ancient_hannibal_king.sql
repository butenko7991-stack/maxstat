ALTER TABLE `purchase_records` ADD `timeSlot` varchar(100);--> statement-breakpoint
ALTER TABLE `purchase_records` ADD `bookingSlot` enum('утро','обед','вечер');