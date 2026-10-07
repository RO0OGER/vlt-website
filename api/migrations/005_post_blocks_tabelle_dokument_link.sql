ALTER TABLE `post_sections`
  MODIFY COLUMN `kind`
      ENUM('text','heading','quote','image','gallery','table','document','link')
      NOT NULL DEFAULT 'text',
  ADD COLUMN `url`  VARCHAR(500) DEFAULT NULL AFTER `text`,
  ADD COLUMN `data` JSON         DEFAULT NULL AFTER `url`;


CREATE TABLE `post_section_documents` (
  `id`         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `section_id` INT UNSIGNED NOT NULL,
  `media_id`   INT UNSIGNED NOT NULL,
  `label`      VARCHAR(200) NOT NULL,
  `position`   SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  KEY `ix_ssd_section` (`section_id`, `position`),
  KEY `ix_ssd_media` (`media_id`),

  CONSTRAINT `fk_ssd_section` FOREIGN KEY (`section_id`)
    REFERENCES `post_sections` (`id`) ON DELETE CASCADE,

  CONSTRAINT `fk_ssd_media` FOREIGN KEY (`media_id`)
    REFERENCES `media` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
