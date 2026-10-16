CREATE TABLE `company_settings` (
    `id` INTEGER NOT NULL,
    `legal_name` VARCHAR(191) NULL,
    `trade_name` VARCHAR(191) NULL,
    `cnpj` VARCHAR(14) NULL,
    `full_address` TEXT NULL,
    `phone` VARCHAR(30) NULL,
    `email` VARCHAR(254) NULL,
    `logo_storage_key` VARCHAR(64) NULL,
    `logo_mime` VARCHAR(32) NULL,
    `updated_by_user_id` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `company_settings_updated_by_user_id_idx` (`updated_by_user_id`),
    PRIMARY KEY (`id`),
    CONSTRAINT `company_settings_updated_by_user_id_fkey`
      FOREIGN KEY (`updated_by_user_id`) REFERENCES `users` (`id`)
      ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- The singleton row is intentionally empty: official company information must
-- be entered by an Administrator and is never fabricated by the migration.
INSERT INTO `company_settings` (`id`, `updated_at`) VALUES (1, CURRENT_TIMESTAMP(3));
