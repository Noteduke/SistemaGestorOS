CREATE TABLE `product_stock_movements` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `public_id` CHAR(36) NOT NULL,
    `product_id` INTEGER NOT NULL,
    `type` ENUM('MANUAL_ENTRY', 'MANUAL_ADJUSTMENT', 'DEFECTIVE_CLASSIFIED', 'DEFECTIVE_RETURNED', 'DEFECTIVE_DISCARDED') NOT NULL,
    `origin` ENUM('MANUAL') NOT NULL DEFAULT 'MANUAL',
    `total_delta` INTEGER NOT NULL DEFAULT 0,
    `applied_delta` INTEGER NOT NULL DEFAULT 0,
    `defective_delta` INTEGER NOT NULL DEFAULT 0,
    `actor_user_id` INTEGER NOT NULL,
    `occurred_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `product_stock_movements_public_id_key`(`public_id`),
    INDEX `product_stock_movements_product_id_occurred_at_id_idx`(`product_id`, `occurred_at`, `id`),
    INDEX `product_stock_movements_actor_user_id_occurred_at_idx`(`actor_user_id`, `occurred_at`),
    PRIMARY KEY (`id`),
    CONSTRAINT `product_stock_movements_product_id_fkey`
        FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT `product_stock_movements_actor_user_id_fkey`
        FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT `product_stock_movements_shape_chk` CHECK (
        (`type` = 'MANUAL_ENTRY' AND `total_delta` > 0 AND `applied_delta` = 0 AND `defective_delta` = 0)
        OR (`type` = 'MANUAL_ADJUSTMENT' AND `total_delta` <> 0 AND `applied_delta` = 0 AND `defective_delta` = 0)
        OR (`type` = 'DEFECTIVE_CLASSIFIED' AND `total_delta` = 0 AND `applied_delta` = 0 AND `defective_delta` > 0)
        OR (`type` = 'DEFECTIVE_RETURNED' AND `total_delta` = 0 AND `applied_delta` = 0 AND `defective_delta` < 0)
        OR (`type` = 'DEFECTIVE_DISCARDED' AND `total_delta` < 0 AND `applied_delta` = 0 AND `defective_delta` = `total_delta`)
    )
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
