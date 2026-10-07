-- AlterTable
ALTER TABLE `people` ADD COLUMN `municipal_registration` TEXT NULL,
    ADD COLUMN `observations` TEXT NULL,
    ADD COLUMN `person_type` ENUM('PF', 'PJ') NOT NULL,
    ADD COLUMN `state_registration` TEXT NULL,
    ADD COLUMN `trade_name` TEXT NULL;
