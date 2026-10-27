-- Additive only. Preserve all people, contacts, addresses and openings.
ALTER TABLE `people`
  ADD COLUMN `contact_name` VARCHAR(191) NULL,
  ADD COLUMN `warning` TEXT NULL;
ALTER TABLE `service_order_openings`
  ADD COLUMN `customer_created_during_opening` BOOLEAN NOT NULL DEFAULT false;
