CREATE TABLE `products` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `public_id` CHAR(36) NOT NULL,
    `internal_code` VARCHAR(64) COLLATE utf8mb4_bin NULL,
    `description` VARCHAR(255) NOT NULL,
    `category` ENUM('PART', 'RESALE_GOOD') NOT NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `version` INTEGER NOT NULL DEFAULT 1,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `created_by_user_id` INTEGER NOT NULL,
    `updated_by_user_id` INTEGER NOT NULL,

    UNIQUE INDEX `products_public_id_key`(`public_id`),
    UNIQUE INDEX `products_internal_code_key`(`internal_code`),
    INDEX `products_is_active_category_description_id_idx`(`is_active`, `category`, `description`, `id`),
    INDEX `products_description_id_idx`(`description`, `id`),
    INDEX `products_created_by_user_id_idx`(`created_by_user_id`),
    INDEX `products_updated_by_user_id_idx`(`updated_by_user_id`),
    CONSTRAINT `products_description_nonempty_check` CHECK (CHAR_LENGTH(TRIM(`description`)) > 0),
    CONSTRAINT `products_version_positive_check` CHECK (`version` > 0),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `products`
  ADD CONSTRAINT `products_created_by_user_id_fkey` FOREIGN KEY (`created_by_user_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `products_updated_by_user_id_fkey` FOREIGN KEY (`updated_by_user_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
