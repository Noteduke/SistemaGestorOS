-- Add contact public identifiers as nullable first so existing rows can be backfilled.
ALTER TABLE `person_phones` ADD COLUMN `public_id` CHAR(36) NULL;
ALTER TABLE `person_emails` ADD COLUMN `public_id` CHAR(36) NULL;

UPDATE `person_phones` SET `public_id` = UUID() WHERE `public_id` IS NULL;
UPDATE `person_emails` SET `public_id` = UUID() WHERE `public_id` IS NULL;

ALTER TABLE `person_phones` MODIFY COLUMN `public_id` CHAR(36) NOT NULL;
ALTER TABLE `person_emails` MODIFY COLUMN `public_id` CHAR(36) NOT NULL;

CREATE TABLE `person_contact_events` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `person_id` INTEGER NOT NULL,
    `event_type` ENUM('PHONE_CREATED', 'EMAIL_CREATED', 'PHONE_PRIMARY_CHANGED', 'EMAIL_PRIMARY_CHANGED') NOT NULL,
    `phone_id` INTEGER NULL,
    `email_id` INTEGER NULL,
    `previous_contact_public_id` CHAR(36) NULL,
    `previous_value` VARCHAR(254) NULL,
    `new_value` VARCHAR(254) NOT NULL,
    `occurred_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `person_contact_events_person_id_occurred_at_idx`(`person_id`, `occurred_at`),
    PRIMARY KEY (`id`),
    CONSTRAINT `person_contact_events_person_id_fkey`
        FOREIGN KEY (`person_id`) REFERENCES `people`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT `person_contact_events_phone_id_fkey`
        FOREIGN KEY (`phone_id`) REFERENCES `person_phones`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT `person_contact_events_email_id_fkey`
        FOREIGN KEY (`email_id`) REFERENCES `person_emails`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE UNIQUE INDEX `person_phones_public_id_key` ON `person_phones`(`public_id`);
CREATE UNIQUE INDEX `person_emails_public_id_key` ON `person_emails`(`public_id`);
CREATE UNIQUE INDEX `person_emails_person_id_address_key` ON `person_emails`(`person_id`, `address`);

-- MySQL UNIQUE accepts multiple NULLs: non-primary contacts remain unrestricted.
CREATE UNIQUE INDEX `person_phones_one_primary_per_person_uq`
    ON `person_phones` ((CASE WHEN `is_primary` = 1 THEN `person_id` ELSE NULL END));
CREATE UNIQUE INDEX `person_emails_one_primary_per_person_uq`
    ON `person_emails` ((CASE WHEN `is_primary` = 1 THEN `person_id` ELSE NULL END));
