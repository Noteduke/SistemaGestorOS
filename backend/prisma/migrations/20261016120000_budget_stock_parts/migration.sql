ALTER TABLE `service_order_budget_items`
    MODIFY `item_type` ENUM('SERVICE_LABOR', 'MANUAL_PART', 'STOCK_PART') NOT NULL,
    MODIFY `origin` ENUM('REGISTERED', 'MANUAL', 'PRODUCT_CATALOG') NOT NULL,
    ADD COLUMN `product_id` INTEGER NULL;

CREATE INDEX `service_order_budget_items_product_id_idx`
    ON `service_order_budget_items` (`product_id`);

CREATE UNIQUE INDEX `budget_item_stock_product_active_uq`
    ON `service_order_budget_items` (`service_order_id`, (CASE
        WHEN `removed_at` IS NULL AND `item_type` = 'STOCK_PART' AND `origin` = 'PRODUCT_CATALOG'
        THEN `product_id` ELSE NULL END));

ALTER TABLE `service_order_budget_items`
    DROP CHECK `budget_item_kind_origin_service_check`;

ALTER TABLE `service_order_budget_items`
    ADD CONSTRAINT `service_order_budget_items_product_id_fkey`
        FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT `budget_item_kind_origin_service_check` CHECK (
        (`item_type` = 'SERVICE_LABOR' AND `origin` = 'REGISTERED' AND `normalized_description` IS NULL AND `unit_cost` IS NULL)
        OR (`item_type` = 'SERVICE_LABOR' AND `origin` = 'MANUAL' AND `normalized_description` IS NOT NULL AND `unit_cost` IS NULL)
        OR (`item_type` = 'MANUAL_PART' AND `origin` = 'MANUAL' AND `normalized_description` IS NOT NULL)
        OR (`item_type` = 'STOCK_PART' AND `origin` = 'PRODUCT_CATALOG' AND `normalized_description` IS NULL AND `unit_cost` IS NULL)
    );
