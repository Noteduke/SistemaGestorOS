-- DropForeignKey
ALTER TABLE `equipment` DROP FOREIGN KEY `equipment_brand_id_fkey`;

-- AlterTable
ALTER TABLE `equipment` ADD COLUMN `is_active` BOOLEAN NOT NULL DEFAULT true,
    MODIFY `brand_id` INTEGER NOT NULL,
    MODIFY `model` VARCHAR(191) NOT NULL;

-- AlterTable
ALTER TABLE `equipment_ownership_events` ADD COLUMN `changed_by_user_id` INTEGER NULL,
    ADD COLUMN `service_order_id` INTEGER NULL;

-- CreateTable
CREATE TABLE `service_order_number_control` (
    `id` INTEGER NOT NULL,
    `next_number` BIGINT NOT NULL DEFAULT 1,
    `highest_reserved_number` BIGINT NOT NULL DEFAULT 0,
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `service_order_number_allocations` (
    `number_value` BIGINT NOT NULL,
    `status` ENUM('RESERVED', 'CONFIRMED', 'CONSUMED', 'RELEASED') NOT NULL,
    `opening_id` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `service_order_number_allocations_opening_id_key`(`opening_id`),
    INDEX `service_order_number_allocations_status_updated_at_idx`(`status`, `updated_at`),
    PRIMARY KEY (`number_value`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `service_order_openings` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `public_id` CHAR(36) NOT NULL,
    `status` ENUM('IN_PROGRESS', 'CONFIRMED', 'CANCELED') NOT NULL DEFAULT 'IN_PROGRESS',
    `initiated_by_user_id` INTEGER NOT NULL,
    `active_for_user_id` INTEGER NULL,
    `attempted_number_value` BIGINT NOT NULL,
    `customer_id` INTEGER NULL,
    `equipment_id` INTEGER NULL,
    `equipment_draft_json` JSON NULL,
    `equipment_draft_version` INTEGER NULL,
    `transfer_requested` BOOLEAN NOT NULL DEFAULT false,
    `transfer_requested_by_user_id` INTEGER NULL,
    `transfer_requested_at` DATETIME(3) NULL,
    `complaint` TEXT NULL,
    `resumed_at` DATETIME(3) NULL,
    `confirmed_at` DATETIME(3) NULL,
    `canceled_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `service_order_openings_public_id_key`(`public_id`),
    UNIQUE INDEX `service_order_openings_active_for_user_id_key`(`active_for_user_id`),
    INDEX `service_order_openings_initiated_by_user_id_status_updated_a_idx`(`initiated_by_user_id`, `status`, `updated_at`),
    INDEX `service_order_openings_status_created_at_idx`(`status`, `created_at`),
    INDEX `service_order_openings_customer_id_idx`(`customer_id`),
    INDEX `service_order_openings_equipment_id_idx`(`equipment_id`),
    INDEX `service_order_openings_attempted_number_value_idx`(`attempted_number_value`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `service_orders` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `public_id` CHAR(36) NOT NULL,
    `opening_id` INTEGER NOT NULL,
    `number_value` BIGINT NOT NULL,
    `customer_id` INTEGER NOT NULL,
    `equipment_id` INTEGER NOT NULL,
    `created_by_user_id` INTEGER NOT NULL,
    `macro_status` ENUM('ABERTA') NOT NULL DEFAULT 'ABERTA',
    `operational_situation` ENUM('TRIAGEM', 'AGUARDANDO AVALIAÇÃO/ORÇAMENTO', 'AGUARDANDO APROVAÇÃO DO ORÇAMENTO', 'AUTORIZADO REPARO', 'AGUARDANDO COMPRA DE PEÇA', 'AGUARDANDO CHEGADA DE PEÇA', 'PRONTO AVISAR CLIENTE', 'PRONTO CLIENTE AVISADO', 'NÃO AUTORIZADO - REMONTAR EQUIPAMENTO', 'NÃO AUTORIZADO - PRONTO PRA ENTREGA') NOT NULL DEFAULT 'TRIAGEM',
    `complaint` TEXT NULL,
    `intake_observations` TEXT NULL,
    `new_equipment_serial_identification_status` ENUM('IDENTIFIED', 'NOT_IDENTIFIED') NULL,
    `customer_snapshot_json` JSON NOT NULL,
    `equipment_snapshot_json` JSON NOT NULL,
    `snapshot_version` INTEGER NOT NULL DEFAULT 1,
    `snapshot_captured_at` DATETIME(3) NOT NULL,
    `opened_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `service_orders_public_id_key`(`public_id`),
    UNIQUE INDEX `service_orders_opening_id_key`(`opening_id`),
    UNIQUE INDEX `service_orders_number_value_key`(`number_value`),
    INDEX `service_orders_macro_status_operational_situation_opened_at_idx`(`macro_status`, `operational_situation`, `opened_at`),
    INDEX `service_orders_customer_id_opened_at_idx`(`customer_id`, `opened_at`),
    INDEX `service_orders_equipment_id_opened_at_idx`(`equipment_id`, `opened_at`),
    INDEX `service_orders_created_by_user_id_opened_at_idx`(`created_by_user_id`, `opened_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `service_order_assignments` (
    `service_order_id` INTEGER NOT NULL,
    `user_id` INTEGER NOT NULL,
    `assigned_by_user_id` INTEGER NOT NULL,
    `assigned_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `service_order_assignments_user_id_service_order_id_idx`(`user_id`, `service_order_id`),
    INDEX `service_order_assignments_assigned_by_user_id_assigned_at_idx`(`assigned_by_user_id`, `assigned_at`),
    PRIMARY KEY (`service_order_id`, `user_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `service_order_events` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `service_order_id` INTEGER NULL,
    `opening_id` INTEGER NULL,
    `actor_user_id` INTEGER NOT NULL,
    `initiating_user_id` INTEGER NULL,
    `event_type` VARCHAR(80) NOT NULL,
    `number_value` BIGINT NOT NULL,
    `occurred_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `payload_json` JSON NULL,

    INDEX `service_order_events_service_order_id_occurred_at_idx`(`service_order_id`, `occurred_at`),
    INDEX `service_order_events_opening_id_occurred_at_idx`(`opening_id`, `occurred_at`),
    INDEX `service_order_events_actor_user_id_occurred_at_idx`(`actor_user_id`, `occurred_at`),
    INDEX `service_order_events_event_type_occurred_at_idx`(`event_type`, `occurred_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `equipment_ownership_events_service_order_id_idx` ON `equipment_ownership_events`(`service_order_id`);

-- CreateIndex
CREATE INDEX `equipment_ownership_events_changed_by_user_id_changed_at_idx` ON `equipment_ownership_events`(`changed_by_user_id`, `changed_at`);

-- AddForeignKey
ALTER TABLE `equipment` ADD CONSTRAINT `equipment_brand_id_fkey` FOREIGN KEY (`brand_id`) REFERENCES `equipment_brands`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `equipment_ownership_events` ADD CONSTRAINT `equipment_ownership_events_service_order_id_fkey` FOREIGN KEY (`service_order_id`) REFERENCES `service_orders`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `equipment_ownership_events` ADD CONSTRAINT `equipment_ownership_events_changed_by_user_id_fkey` FOREIGN KEY (`changed_by_user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `service_order_number_allocations` ADD CONSTRAINT `service_order_number_allocations_opening_id_fkey` FOREIGN KEY (`opening_id`) REFERENCES `service_order_openings`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `service_order_openings` ADD CONSTRAINT `service_order_openings_initiated_by_user_id_fkey` FOREIGN KEY (`initiated_by_user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `service_order_openings` ADD CONSTRAINT `service_order_openings_active_for_user_id_fkey` FOREIGN KEY (`active_for_user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `service_order_openings` ADD CONSTRAINT `service_order_openings_transfer_requested_by_user_id_fkey` FOREIGN KEY (`transfer_requested_by_user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `service_order_openings` ADD CONSTRAINT `service_order_openings_customer_id_fkey` FOREIGN KEY (`customer_id`) REFERENCES `people`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `service_order_openings` ADD CONSTRAINT `service_order_openings_equipment_id_fkey` FOREIGN KEY (`equipment_id`) REFERENCES `equipment`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `service_orders` ADD CONSTRAINT `service_orders_opening_id_fkey` FOREIGN KEY (`opening_id`) REFERENCES `service_order_openings`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `service_orders` ADD CONSTRAINT `service_orders_number_value_fkey` FOREIGN KEY (`number_value`) REFERENCES `service_order_number_allocations`(`number_value`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `service_orders` ADD CONSTRAINT `service_orders_customer_id_fkey` FOREIGN KEY (`customer_id`) REFERENCES `people`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `service_orders` ADD CONSTRAINT `service_orders_equipment_id_fkey` FOREIGN KEY (`equipment_id`) REFERENCES `equipment`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `service_orders` ADD CONSTRAINT `service_orders_created_by_user_id_fkey` FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `service_order_assignments` ADD CONSTRAINT `service_order_assignments_service_order_id_fkey` FOREIGN KEY (`service_order_id`) REFERENCES `service_orders`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `service_order_assignments` ADD CONSTRAINT `service_order_assignments_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `service_order_assignments` ADD CONSTRAINT `service_order_assignments_assigned_by_user_id_fkey` FOREIGN KEY (`assigned_by_user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `service_order_events` ADD CONSTRAINT `service_order_events_service_order_id_fkey` FOREIGN KEY (`service_order_id`) REFERENCES `service_orders`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `service_order_events` ADD CONSTRAINT `service_order_events_opening_id_fkey` FOREIGN KEY (`opening_id`) REFERENCES `service_order_openings`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `service_order_events` ADD CONSTRAINT `service_order_events_actor_user_id_fkey` FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `service_order_events` ADD CONSTRAINT `service_order_events_initiating_user_id_fkey` FOREIGN KEY (`initiating_user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- The singleton invariant is independent of foreign keys and can be enforced in MySQL.
ALTER TABLE `service_order_number_control`
    ADD CONSTRAINT `service_order_number_control_singleton_chk` CHECK (`id` = 1);

INSERT INTO `service_order_number_control`
    (`id`, `next_number`, `highest_reserved_number`, `updated_at`)
VALUES (1, 1, 0, CURRENT_TIMESTAMP(3));
