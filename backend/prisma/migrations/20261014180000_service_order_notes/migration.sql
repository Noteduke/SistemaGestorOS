CREATE TABLE `service_order_notes` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `public_id` CHAR(36) NOT NULL,
    `service_order_id` INTEGER NOT NULL,
    `author_user_id` INTEGER NOT NULL,
    `text` VARCHAR(255) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `service_order_notes_public_id_key`(`public_id`),
    INDEX `service_order_notes_service_order_id_created_at_id_idx`(`service_order_id`, `created_at`, `id`),
    INDEX `service_order_notes_author_user_id_idx`(`author_user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `service_order_notes` ADD CONSTRAINT `service_order_notes_service_order_id_fkey` FOREIGN KEY (`service_order_id`) REFERENCES `service_orders`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `service_order_notes` ADD CONSTRAINT `service_order_notes_author_user_id_fkey` FOREIGN KEY (`author_user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
