ALTER TABLE `product_stock_movements`
    ADD CONSTRAINT `product_stock_reversal_destination_chk` CHECK (
        `type` <> 'SERVICE_ORDER_CONSUMPTION_REVERSED'
        OR `reversal_destination` IS NOT NULL
    );
