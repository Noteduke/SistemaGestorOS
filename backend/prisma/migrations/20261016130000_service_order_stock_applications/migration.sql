ALTER TABLE `product_stock_movements`
    MODIFY `type` ENUM(
        'MANUAL_ENTRY',
        'MANUAL_ADJUSTMENT',
        'DEFECTIVE_CLASSIFIED',
        'DEFECTIVE_RETURNED',
        'DEFECTIVE_DISCARDED',
        'SERVICE_ORDER_APPLIED',
        'SERVICE_ORDER_REVERSED'
    ) NOT NULL,
    MODIFY `origin` ENUM('MANUAL', 'SERVICE_ORDER') NOT NULL DEFAULT 'MANUAL',
    ADD COLUMN `service_order_id` INTEGER NULL,
    ADD COLUMN `budget_item_id` INTEGER NULL,
    ADD COLUMN `source_movement_id` INTEGER NULL,
    ADD COLUMN `unit_cost_snapshot` DECIMAL(15, 2) NULL;

ALTER TABLE `product_stock_movements`
    DROP CHECK `product_stock_movements_shape_chk`;

CREATE INDEX `stock_movement_order_item_time_idx`
    ON `product_stock_movements` (`service_order_id`, `budget_item_id`, `occurred_at`, `id`);

CREATE INDEX `stock_movement_source_time_idx`
    ON `product_stock_movements` (`source_movement_id`, `occurred_at`, `id`);

ALTER TABLE `product_stock_movements`
    ADD CONSTRAINT `product_stock_movements_service_order_id_fkey`
        FOREIGN KEY (`service_order_id`) REFERENCES `service_orders` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT `product_stock_movements_budget_item_id_fkey`
        FOREIGN KEY (`budget_item_id`) REFERENCES `service_order_budget_items` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT `product_stock_movements_source_movement_id_fkey`
        FOREIGN KEY (`source_movement_id`) REFERENCES `product_stock_movements` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT `product_stock_movements_shape_chk` CHECK (
        (`type` = 'MANUAL_ENTRY' AND `origin` = 'MANUAL' AND `total_delta` > 0 AND `applied_delta` = 0 AND `defective_delta` = 0)
        OR (`type` = 'MANUAL_ADJUSTMENT' AND `origin` = 'MANUAL' AND `total_delta` <> 0 AND `applied_delta` = 0 AND `defective_delta` = 0)
        OR (`type` = 'DEFECTIVE_CLASSIFIED' AND `origin` = 'MANUAL' AND `total_delta` = 0 AND `applied_delta` = 0 AND `defective_delta` > 0)
        OR (`type` = 'DEFECTIVE_RETURNED' AND `origin` = 'MANUAL' AND `total_delta` = 0 AND `applied_delta` = 0 AND `defective_delta` < 0)
        OR (`type` = 'DEFECTIVE_DISCARDED' AND `origin` = 'MANUAL' AND `total_delta` < 0 AND `applied_delta` = 0 AND `defective_delta` = `total_delta`)
        OR (`type` = 'SERVICE_ORDER_APPLIED' AND `origin` = 'SERVICE_ORDER' AND `total_delta` = 0 AND `applied_delta` > 0 AND `defective_delta` = 0)
        OR (`type` = 'SERVICE_ORDER_REVERSED' AND `origin` = 'SERVICE_ORDER' AND `total_delta` = 0 AND `applied_delta` < 0 AND `defective_delta` >= 0 AND `defective_delta` <= -`applied_delta`)
    );

DROP INDEX `budget_item_manual_part_active_uq` ON `service_order_budget_items`;
