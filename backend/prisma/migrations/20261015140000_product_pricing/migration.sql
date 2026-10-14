ALTER TABLE `products`
  ADD COLUMN `sale_price` DECIMAL(15,2) NULL,
  ADD COLUMN `acquisition_cost` DECIMAL(15,2) NULL,
  ADD CONSTRAINT `products_sale_price_nonnegative_check`
    CHECK (`sale_price` IS NULL OR `sale_price` >= 0),
  ADD CONSTRAINT `products_acquisition_cost_nonnegative_check`
    CHECK (`acquisition_cost` IS NULL OR `acquisition_cost` >= 0);
