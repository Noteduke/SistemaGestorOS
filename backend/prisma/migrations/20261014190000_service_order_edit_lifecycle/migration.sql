ALTER TABLE `service_order_edit_controls`
  ADD COLUMN `holder_session_id` INTEGER NULL,
  ADD INDEX `service_order_edit_controls_holder_session_id_expires_at_idx` (`holder_session_id`, `expires_at`),
  ADD CONSTRAINT `service_order_edit_controls_holder_session_id_fkey`
    FOREIGN KEY (`holder_session_id`) REFERENCES `user_sessions`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- Existing controls predate session ownership. Invalidate them so no pre-migration
-- context can continue editing without a verifiable authenticated session.
UPDATE `service_order_edit_controls`
SET `holder_user_id` = NULL,
    `context_token_hash` = NULL,
    `lease_version` = `lease_version` + 1,
    `expires_at` = CURRENT_TIMESTAMP(3)
WHERE `holder_user_id` IS NOT NULL;
