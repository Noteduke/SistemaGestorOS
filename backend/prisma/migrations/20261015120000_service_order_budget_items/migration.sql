CREATE TABLE `service_order_budget_name_locks` (
    `normalized_name` VARCHAR(255) COLLATE utf8mb4_bin NOT NULL,
    PRIMARY KEY (`normalized_name`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `service_order_budget_items` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `public_id` CHAR(36) NOT NULL,
    `service_order_id` INTEGER NOT NULL,
    `item_type` ENUM('SERVICE_LABOR', 'MANUAL_PART') NOT NULL,
    `origin` ENUM('REGISTERED', 'MANUAL') NOT NULL,
    `service_catalog_id` INTEGER NULL,
    `description` VARCHAR(255) NOT NULL,
    `normalized_description` VARCHAR(255) COLLATE utf8mb4_bin NULL,
    `quantity` INTEGER NOT NULL DEFAULT 1,
    `unit_price` DECIMAL(15,2) NOT NULL,
    `unit_cost` DECIMAL(15,2) NULL,
    `version` INTEGER NOT NULL DEFAULT 1,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `created_by_user_id` INTEGER NOT NULL,
    `updated_by_user_id` INTEGER NOT NULL,
    `removed_at` DATETIME(3) NULL,
    `removed_by_user_id` INTEGER NULL,

    UNIQUE INDEX `service_order_budget_items_public_id_key` (`public_id`),
    UNIQUE INDEX `budget_item_registered_service_active_uq` (`service_order_id`, (CASE WHEN `removed_at` IS NULL AND `item_type` = 'SERVICE_LABOR' AND `origin` = 'REGISTERED' THEN `service_catalog_id` ELSE NULL END)),
    UNIQUE INDEX `budget_item_manual_labor_active_uq` (`service_order_id`, (CASE WHEN `removed_at` IS NULL AND `item_type` = 'SERVICE_LABOR' AND `origin` = 'MANUAL' THEN `normalized_description` ELSE NULL END)),
    UNIQUE INDEX `budget_item_manual_part_active_uq` (`service_order_id`, (CASE WHEN `removed_at` IS NULL AND `item_type` = 'MANUAL_PART' AND `origin` = 'MANUAL' THEN `normalized_description` ELSE NULL END)),
    INDEX `service_order_budget_items_service_order_id_removed_at_id_idx` (`service_order_id`, `removed_at`, `id`),
    INDEX `service_order_budget_items_service_catalog_id_idx` (`service_catalog_id`),
    INDEX `service_order_budget_items_created_by_user_id_idx` (`created_by_user_id`),
    INDEX `service_order_budget_items_updated_by_user_id_idx` (`updated_by_user_id`),
    INDEX `service_order_budget_items_removed_by_user_id_idx` (`removed_by_user_id`),
    CONSTRAINT `budget_item_quantity_range_check` CHECK (`quantity` BETWEEN 1 AND 999),
    CONSTRAINT `budget_item_unit_price_nonnegative_check` CHECK (`unit_price` >= 0 AND `unit_price` <= 999999.99),
    CONSTRAINT `budget_item_unit_cost_range_check` CHECK (`unit_cost` IS NULL OR (`unit_cost` >= 0 AND `unit_cost` <= 999999.99)),
    CONSTRAINT `budget_item_version_positive_check` CHECK (`version` > 0),
    CONSTRAINT `budget_item_kind_origin_service_check` CHECK (
      (`item_type` = 'SERVICE_LABOR' AND `origin` = 'REGISTERED' AND `normalized_description` IS NULL AND `unit_cost` IS NULL)
      OR (`item_type` = 'SERVICE_LABOR' AND `origin` = 'MANUAL' AND `normalized_description` IS NOT NULL AND `unit_cost` IS NULL)
      OR (`item_type` = 'MANUAL_PART' AND `origin` = 'MANUAL' AND `normalized_description` IS NOT NULL)
    ),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `service_order_budget_items`
  ADD CONSTRAINT `service_order_budget_items_service_order_id_fkey` FOREIGN KEY (`service_order_id`) REFERENCES `service_orders` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `service_order_budget_items_service_catalog_id_fkey` FOREIGN KEY (`service_catalog_id`) REFERENCES `service_catalog` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `service_order_budget_items_created_by_user_id_fkey` FOREIGN KEY (`created_by_user_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `service_order_budget_items_updated_by_user_id_fkey` FOREIGN KEY (`updated_by_user_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `service_order_budget_items_removed_by_user_id_fkey` FOREIGN KEY (`removed_by_user_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
