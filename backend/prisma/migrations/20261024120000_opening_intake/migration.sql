-- Per-attendance data. Existing equipment and historical snapshots are unchanged.
ALTER TABLE `service_order_openings` ADD COLUMN `intake_data_json` JSON NULL;
ALTER TABLE `service_orders` ADD COLUMN `intake_data_json` JSON NULL;
