ALTER TABLE `users`
  MODIFY COLUMN `role` ENUM('owner', 'admin', 'buyer', 'manager', 'user') NOT NULL DEFAULT 'user';

ALTER TABLE `users`
  ADD COLUMN `teamOwnerId` INT NULL AFTER `role`;

UPDATE `users`
  SET `teamOwnerId` = `id`
  WHERE `teamOwnerId` IS NULL AND `id` = 1;

UPDATE `users`
  SET `teamOwnerId` = NULL
  WHERE `teamOwnerId` IS NULL;

UPDATE `users`
  SET `role` = 'owner', `teamOwnerId` = `id`
  WHERE `id` = 1;
