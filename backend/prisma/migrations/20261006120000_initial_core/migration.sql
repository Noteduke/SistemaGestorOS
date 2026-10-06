CREATE TABLE `people` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `public_id` CHAR(36) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `document` VARCHAR(14) NULL,
  `is_active` BOOLEAN NOT NULL DEFAULT true,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  `primary_contact_id` INTEGER NULL,
  INDEX `people_name_idx` (`name`),
  UNIQUE INDEX `people_public_id_key` (`public_id`),
  UNIQUE INDEX `people_document_key` (`document`),
  PRIMARY KEY (`id`),
  CONSTRAINT `people_primary_contact_id_fkey` FOREIGN KEY (`primary_contact_id`) REFERENCES `people` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `person_roles` (
  `person_id` INTEGER NOT NULL,
  `role` ENUM('CUSTOMER', 'SUPPLIER', 'CARRIER', 'SERVICE_PROVIDER') NOT NULL,
  PRIMARY KEY (`person_id`, `role`),
  CONSTRAINT `person_roles_person_id_fkey` FOREIGN KEY (`person_id`) REFERENCES `people` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `person_phones` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `person_id` INTEGER NOT NULL,
  `label` VARCHAR(80) NULL,
  `number` VARCHAR(32) NOT NULL,
  `is_primary` BOOLEAN NOT NULL DEFAULT false,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `person_phones_person_id_is_primary_idx` (`person_id`, `is_primary`),
  PRIMARY KEY (`id`),
  CONSTRAINT `person_phones_person_id_fkey` FOREIGN KEY (`person_id`) REFERENCES `people` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `person_emails` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `person_id` INTEGER NOT NULL,
  `label` VARCHAR(80) NULL,
  `address` VARCHAR(254) NOT NULL,
  `is_primary` BOOLEAN NOT NULL DEFAULT false,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `person_emails_person_id_is_primary_idx` (`person_id`, `is_primary`),
  PRIMARY KEY (`id`),
  CONSTRAINT `person_emails_person_id_fkey` FOREIGN KEY (`person_id`) REFERENCES `people` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `person_addresses` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `person_id` INTEGER NOT NULL,
  `postal_code` VARCHAR(16) NULL,
  `street` VARCHAR(191) NULL,
  `number` VARCHAR(32) NULL,
  `complement` VARCHAR(100) NULL,
  `district` VARCHAR(100) NULL,
  `city` VARCHAR(100) NULL,
  `state` CHAR(2) NULL,
  `country` CHAR(2) NOT NULL DEFAULT 'BR',
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  UNIQUE INDEX `person_addresses_person_id_key` (`person_id`),
  PRIMARY KEY (`id`),
  CONSTRAINT `person_addresses_person_id_fkey` FOREIGN KEY (`person_id`) REFERENCES `people` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `equipment_types` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `public_id` CHAR(36) NOT NULL,
  `name` VARCHAR(100) NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  UNIQUE INDEX `equipment_types_public_id_key` (`public_id`),
  UNIQUE INDEX `equipment_types_name_key` (`name`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `equipment_brands` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `public_id` CHAR(36) NOT NULL,
  `name` VARCHAR(100) NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  UNIQUE INDEX `equipment_brands_public_id_key` (`public_id`),
  UNIQUE INDEX `equipment_brands_name_key` (`name`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `equipment` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `public_id` CHAR(36) NOT NULL,
  `owner_id` INTEGER NOT NULL,
  `type_id` INTEGER NOT NULL,
  `brand_id` INTEGER NULL,
  `model` VARCHAR(191) NULL,
  `serial_number` VARCHAR(191) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  INDEX `equipment_owner_id_idx` (`owner_id`),
  INDEX `equipment_serial_number_idx` (`serial_number`),
  UNIQUE INDEX `equipment_public_id_key` (`public_id`),
  PRIMARY KEY (`id`),
  CONSTRAINT `equipment_owner_id_fkey` FOREIGN KEY (`owner_id`) REFERENCES `people` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `equipment_type_id_fkey` FOREIGN KEY (`type_id`) REFERENCES `equipment_types` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `equipment_brand_id_fkey` FOREIGN KEY (`brand_id`) REFERENCES `equipment_brands` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `equipment_ownership_events` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `equipment_id` INTEGER NOT NULL,
  `previous_owner_id` INTEGER NULL,
  `new_owner_id` INTEGER NOT NULL,
  `changed_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `equipment_ownership_events_equipment_id_changed_at_idx` (`equipment_id`, `changed_at`),
  PRIMARY KEY (`id`),
  CONSTRAINT `equipment_ownership_events_equipment_id_fkey` FOREIGN KEY (`equipment_id`) REFERENCES `equipment` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `equipment_ownership_events_previous_owner_id_fkey` FOREIGN KEY (`previous_owner_id`) REFERENCES `people` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `equipment_ownership_events_new_owner_id_fkey` FOREIGN KEY (`new_owner_id`) REFERENCES `people` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
