CREATE TABLE `service_order_edit_controls` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `service_order_id` INTEGER NOT NULL,
    `holder_user_id` INTEGER NULL,
    `context_token_hash` CHAR(64) NULL,
    `lease_version` INTEGER NOT NULL DEFAULT 0,
    `last_heartbeat_at` DATETIME(3) NOT NULL,
    `expires_at` DATETIME(3) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `service_order_edit_controls_service_order_id_key` (`service_order_id`),
    INDEX `service_order_edit_controls_holder_user_id_expires_at_idx` (`holder_user_id`, `expires_at`),
    INDEX `service_order_edit_controls_expires_at_idx` (`expires_at`),
    PRIMARY KEY (`id`),
    CONSTRAINT `service_order_edit_controls_service_order_id_fkey` FOREIGN KEY (`service_order_id`) REFERENCES `service_orders`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT `service_order_edit_controls_holder_user_id_fkey` FOREIGN KEY (`holder_user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
