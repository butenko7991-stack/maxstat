CREATE TABLE IF NOT EXISTS `channel_creatives` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `userId` INT NOT NULL,
  `channelId` INT NOT NULL,
  `title` VARCHAR(255),
  `postText` TEXT,
  `imagePath` VARCHAR(1024),
  `imageMime` VARCHAR(100),
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `channel_creatives_user_channel_idx` (`userId`, `channelId`)
);
