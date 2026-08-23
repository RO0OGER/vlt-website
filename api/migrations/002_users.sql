-- Migration 002: Admin-Benutzerverwaltung
-- Legt die Tabellen fuer die Authentifizierung an.
--
-- Berechtigungen fuer den Datenbankbenutzer:
--   GRANT SELECT, INSERT, UPDATE, DELETE ON `users`       TO 'db_user'@'localhost';
--   GRANT SELECT, INSERT, UPDATE, DELETE ON `user_tokens` TO 'db_user'@'localhost';

CREATE TABLE IF NOT EXISTS users (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  email         VARCHAR(255) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_users_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Pro Benutzer wird genau ein aktives Token gespeichert (8 h gueltig).
-- Bei erneutem Login wird das alte Token ersetzt.
CREATE TABLE IF NOT EXISTS user_tokens (
  id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id    INT UNSIGNED NOT NULL,
  token      CHAR(64)     NOT NULL,
  expires_at DATETIME     NOT NULL,
  created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_user_tokens_token (token),
  KEY k_user_tokens_user (user_id),
  CONSTRAINT fk_user_tokens_user
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
