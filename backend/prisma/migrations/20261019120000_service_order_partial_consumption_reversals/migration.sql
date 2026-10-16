ALTER TABLE `product_stock_movements`
    ADD COLUMN `reversal_destination` ENUM('AVAILABLE', 'DEFECTIVE') NULL;

UPDATE `product_stock_movements`
SET `reversal_destination` = 'AVAILABLE'
WHERE `type` = 'SERVICE_ORDER_CONSUMPTION_REVERSED';

ALTER TABLE `product_stock_movements`
    DROP CHECK `product_stock_movements_shape_chk`,
    DROP FOREIGN KEY `product_stock_movements_reverses_movement_id_fkey`;

DROP INDEX `stock_movement_reverses_movement_uq` ON `product_stock_movements`;

CREATE INDEX `stock_movement_reverses_movement_idx`
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
        OR (`type` = 'SERVICE_ORDER_CONSUMPTION_REVERSED' AND `origin` = 'SERVICE_ORDER' AND `total_delta` > 0 AND `applied_delta` = 0
            AND ((`reversal_destination` = 'AVAILABLE' AND `defective_delta` = 0)
                OR (`reversal_destination` = 'DEFECTIVE' AND `defective_delta` = `total_delta`)))
    );
