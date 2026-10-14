CREATE TABLE `service_catalog` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `public_id` CHAR(36) NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `normalized_name` VARCHAR(191) COLLATE utf8mb4_bin NOT NULL,
    `default_price` DECIMAL(15,2) NOT NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `version` INTEGER NOT NULL DEFAULT 1,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `created_by_user_id` INTEGER NOT NULL,
    `updated_by_user_id` INTEGER NOT NULL,

    UNIQUE INDEX `service_catalog_public_id_key`(`public_id`),
    UNIQUE INDEX `service_catalog_normalized_name_key`(`normalized_name`),
    INDEX `service_catalog_is_active_name_id_idx`(`is_active`, `name`, `id`),
    INDEX `service_catalog_name_id_idx`(`name`, `id`),
    INDEX `service_catalog_created_by_user_id_idx`(`created_by_user_id`),
    INDEX `service_catalog_updated_by_user_id_idx`(`updated_by_user_id`),
    CONSTRAINT `service_catalog_name_nonempty_check` CHECK (CHAR_LENGTH(TRIM(`name`)) > 0),
    CONSTRAINT `service_catalog_default_price_nonnegative_check` CHECK (`default_price` >= 0),
    CONSTRAINT `service_catalog_version_positive_check` CHECK (`version` > 0),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `service_catalog` ADD CONSTRAINT `service_catalog_created_by_user_id_fkey` FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `service_catalog` ADD CONSTRAINT `service_catalog_updated_by_user_id_fkey` FOREIGN KEY (`updated_by_user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
