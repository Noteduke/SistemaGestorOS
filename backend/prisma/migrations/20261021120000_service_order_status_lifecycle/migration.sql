ALTER TABLE `service_order_statuses`
  ADD COLUMN `ever_assigned` BOOLEAN NOT NULL DEFAULT false;

UPDATE `service_order_statuses` AS `s`
SET `s`.`ever_assigned` = true
WHERE EXISTS (
    SELECT 1
    FROM `service_orders` AS `o`
    WHERE `o`.`operational_status_id` = `s`.`id`
       OR `o`.`technical_conclusion_status_id` = `s`.`id`
  )
  OR EXISTS (
    SELECT 1
    FROM `service_order_events` AS `e`
    WHERE JSON_SEARCH(`e`.`payload_json`, 'one', `s`.`public_id`) IS NOT NULL
       OR JSON_SEARCH(`e`.`payload_json`, 'one', `s`.`name`) IS NOT NULL
  );
