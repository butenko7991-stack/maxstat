ALTER TABLE `channel_creatives`
  ADD COLUMN IF NOT EXISTS `recognizedText` TEXT AFTER `postText`;
