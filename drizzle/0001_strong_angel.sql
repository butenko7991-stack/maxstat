CREATE TABLE `channels` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`name` varchar(255) NOT NULL,
	`description` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `channels_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `purchase_records` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`channelId` int NOT NULL,
	`date` timestamp NOT NULL,
	`admin` varchar(255),
	`link` varchar(1024),
	`targetChannels` text,
	`direction` varchar(255),
	`tariff` varchar(100),
	`buyer` varchar(255),
	`spm` varchar(100),
	`cost` decimal(12,2),
	`paymentStatus` enum('paid','unpaid','partial') NOT NULL DEFAULT 'unpaid',
	`botStories` varchar(255),
	`botStoriesCost` decimal(12,2),
	`month` varchar(7) NOT NULL,
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `purchase_records_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sale_records` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`channelId` int NOT NULL,
	`date` timestamp NOT NULL,
	`admin` varchar(255),
	`link` varchar(1024),
	`timeSlot` enum('утро','обед','вечер','ночной топ'),
	`tariff` varchar(100),
	`platform` varchar(255),
	`spm` varchar(100),
	`cost` decimal(12,2),
	`paymentStatus` enum('paid','unpaid','partial') NOT NULL DEFAULT 'unpaid',
	`botStories` varchar(255),
	`botStoriesCost` decimal(12,2),
	`month` varchar(7) NOT NULL,
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `sale_records_id` PRIMARY KEY(`id`)
);
