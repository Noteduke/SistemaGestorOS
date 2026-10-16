CREATE TABLE `service_order_statuses` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `public_id` CHAR(36) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `technical_completion` ENUM('NOT_COMPLETED', 'COMPLETED_WITH_REPAIR', 'COMPLETED_WITHOUT_REPAIR') NOT NULL DEFAULT 'NOT_COMPLETED',
    `allows_budget_withdrawal` BOOLEAN NOT NULL DEFAULT false,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `version` INTEGER NOT NULL DEFAULT 1,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    UNIQUE INDEX `service_order_statuses_public_id_key` (`public_id`),
    UNIQUE INDEX `service_order_statuses_name_key` (`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT INTO `service_order_statuses` (`id`, `public_id`, `name`, `technical_completion`, `allows_budget_withdrawal`, `updated_at`) VALUES
    (1, '00000000-0000-4000-8000-000000000001', 'TRIAGEM', 'NOT_COMPLETED', false, CURRENT_TIMESTAMP(3)),
    (2, '00000000-0000-4000-8000-000000000002', 'AGUARDANDO AVALIAÇÃO/ORÇAMENTO', 'NOT_COMPLETED', false, CURRENT_TIMESTAMP(3)),
    (3, '00000000-0000-4000-8000-000000000003', 'AGUARDANDO APROVAÇÃO DO ORÇAMENTO', 'NOT_COMPLETED', false, CURRENT_TIMESTAMP(3)),
    (4, '00000000-0000-4000-8000-000000000004', 'AUTORIZADO REPARO', 'NOT_COMPLETED', false, CURRENT_TIMESTAMP(3)),
    (5, '00000000-0000-4000-8000-000000000005', 'AGUARDANDO COMPRA DE PEÇA', 'NOT_COMPLETED', false, CURRENT_TIMESTAMP(3)),
    (6, '00000000-0000-4000-8000-000000000006', 'AGUARDANDO CHEGADA DE PEÇA', 'NOT_COMPLETED', false, CURRENT_TIMESTAMP(3)),
    (7, '00000000-0000-4000-8000-000000000007', 'PRONTO AVISAR CLIENTE', 'NOT_COMPLETED', false, CURRENT_TIMESTAMP(3)),
    (8, '00000000-0000-4000-8000-000000000008', 'PRONTO CLIENTE AVISADO', 'NOT_COMPLETED', false, CURRENT_TIMESTAMP(3)),
    (9, '00000000-0000-4000-8000-000000000009', 'NÃO AUTORIZADO - REMONTAR EQUIPAMENTO', 'NOT_COMPLETED', true, CURRENT_TIMESTAMP(3)),
    (10, '00000000-0000-4000-8000-000000000010', 'NÃO AUTORIZADO - PRONTO PRA ENTREGA', 'NOT_COMPLETED', true, CURRENT_TIMESTAMP(3));

ALTER TABLE `service_orders`
    ADD COLUMN `operational_status_id` INTEGER NOT NULL DEFAULT 1,
    ADD COLUMN `technical_completion` ENUM('NOT_COMPLETED', 'COMPLETED_WITH_REPAIR', 'COMPLETED_WITHOUT_REPAIR') NOT NULL DEFAULT 'NOT_COMPLETED',
    ADD COLUMN `technical_completed_at` DATETIME(3) NULL,
    ADD COLUMN `technical_completed_by_user_id` INTEGER NULL,
    ADD COLUMN `technical_conclusion_status_id` INTEGER NULL;

UPDATE `service_orders` SET `operational_status_id` = CASE `operational_situation`
    WHEN 'TRIAGEM' THEN 1
    WHEN 'AGUARDANDO AVALIAÇÃO/ORÇAMENTO' THEN 2
    WHEN 'AGUARDANDO APROVAÇÃO DO ORÇAMENTO' THEN 3
    WHEN 'AUTORIZADO REPARO' THEN 4
    WHEN 'AGUARDANDO COMPRA DE PEÇA' THEN 5
    WHEN 'AGUARDANDO CHEGADA DE PEÇA' THEN 6
    WHEN 'PRONTO AVISAR CLIENTE' THEN 7
    WHEN 'PRONTO CLIENTE AVISADO' THEN 8
    WHEN 'NÃO AUTORIZADO - REMONTAR EQUIPAMENTO' THEN 9
    WHEN 'NÃO AUTORIZADO - PRONTO PRA ENTREGA' THEN 10
    ELSE 1
END;

ALTER TABLE `service_orders`
    DROP INDEX `service_orders_macro_status_operational_situation_opened_at_idx`,
    ADD INDEX `service_orders_macro_status_operational_status_id_opened_at_idx` (`macro_status`, `operational_status_id`, `opened_at`),
    ADD INDEX `service_orders_macro_status_technical_completion_opened_at_idx` (`macro_status`, `technical_completion`, `opened_at`),
    ADD CONSTRAINT `service_orders_operational_status_id_fkey` FOREIGN KEY (`operational_status_id`) REFERENCES `service_order_statuses` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT `service_orders_technical_completed_by_user_id_fkey` FOREIGN KEY (`technical_completed_by_user_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT `service_orders_technical_conclusion_status_id_fkey` FOREIGN KEY (`technical_conclusion_status_id`) REFERENCES `service_order_statuses` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
    DROP COLUMN `operational_situation`;
