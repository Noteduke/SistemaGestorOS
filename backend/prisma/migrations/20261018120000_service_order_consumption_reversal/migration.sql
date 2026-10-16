ALTER TABLE `product_stock_movements`
    MODIFY `type` ENUM(
        'MANUAL_ENTRY',
        'MANUAL_ADJUSTMENT',
        'DEFECTIVE_CLASSIFIED',
        'DEFECTIVE_RETURNED',
        'DEFECTIVE_DISCARDED',
        'SERVICE_ORDER_APPLIED',
        'SERVICE_ORDER_REVERSED',
        'SERVICE_ORDER_CONSUMED',
        'SERVICE_ORDER_CONSUMPTION_REVERSED'
    ) NOT NULL,
    ADD COLUMN `reverses_movement_id` INTEGER NULL;

ALTER TABLE `product_stock_movements`
    DROP CHECK `product_stock_movements_shape_chk`;

CREATE UNIQUE INDEX `stock_movement_reverses_movement_uq`
    ON `product_stock_movements` (`reverses_movement_id`);

ALTER TABLE `product_stock_movements`
    ADD CONSTRAINT `product_stock_movements_reverses_movement_id_fkey`
        FOREIGN KEY (`reverses_movement_id`) REFERENCES `product_stock_movements` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT `product_stock_movements_shape_chk` CHECK (
        (`type` = 'MANUAL_ENTRY' AND `origin` = 'MANUAL' AND `total_delta` > 0 AND `applied_delta` = 0 AND `defective_delta` = 0)
        OR (`type` = 'MANUAL_ADJUSTMENT' AND `origin` = 'MANUAL' AND `total_delta` <> 0 AND `applied_delta` = 0 AND `defective_delta` = 0)
        OR (`type` = 'DEFECTIVE_CLASSIFIED' AND `origin` = 'MANUAL' AND `total_delta` = 0 AND `applied_delta` = 0 AND `defective_delta` > 0)
        OR (`type` = 'DEFECTIVE_RETURNED' AND `origin` = 'MANUAL' AND `total_delta` = 0 AND `applied_delta` = 0 AND `defective_delta` < 0)
        OR (`type` = 'DEFECTIVE_DISCARDED' AND `origin` = 'MANUAL' AND `total_delta` < 0 AND `applied_delta` = 0 AND `defective_delta` = `total_delta`)
        OR (`type` = 'SERVICE_ORDER_APPLIED' AND `origin` = 'SERVICE_ORDER' AND `total_delta` = 0 AND `applied_delta` > 0 AND `defective_delta` = 0)
        OR (`type` = 'SERVICE_ORDER_REVERSED' AND `origin` = 'SERVICE_ORDER' AND `total_delta` = 0 AND `applied_delta` < 0 AND `defective_delta` >= 0 AND `defective_delta` <= -`applied_delta`)
        OR (`type` = 'SERVICE_ORDER_CONSUMED' AND `origin` = 'SERVICE_ORDER' AND `total_delta` < 0 AND `applied_delta` = `total_delta` AND `defective_delta` = 0)
        OR (`type` = 'SERVICE_ORDER_CONSUMPTION_REVERSED' AND `origin` = 'SERVICE_ORDER' AND `total_delta` > 0 AND `applied_delta` = 0 AND `defective_delta` = 0)
    );
