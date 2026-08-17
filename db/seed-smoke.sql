    -- ============================================================
--  Testdaten zum Prüfen der API
-- ============================================================
--
--  Wenige Zeilen, mit denen sich jeder Endpunkt einmal aufrufen
--  laesst – bevor die eigentliche Migration laeuft. Danach mit
--
DELETE FROM posts WHERE slug LIKE 'test-%';
DELETE FROM pages WHERE slug = 'test-seite';
DELETE FROM albums WHERE slug = 'test-album';
--
--  wieder entfernen (media, categories und Verknuepfungen loeschen
--  sich ueber ON DELETE CASCADE bzw. bleiben harmlos stehen).
-- ============================================================

SET NAMES utf8mb4;

INSERT INTO `categories` (`slug`, `name`, `sort`) VALUES
  ('verband', 'Verband', 10),
  ('kurse',   'Kurse',   20);

INSERT INTO `media` (`path`, `alt`, `mime`, `width`, `height`, `bytes`) VALUES
  ('test/platzhalter.jpg', 'Platzhalterbild für den Test', 'image/jpeg', 1600, 1067, 240000);

INSERT INTO `posts`
  (`slug`, `title`, `excerpt`, `published_at`, `author`, `read_minutes`, `cover_id`, `category_id`, `status`)
VALUES
  ('test-erster-beitrag',
   'Erster Testbeitrag',
   'Kurzer Anrisstext, der auf der Karte in der Übersicht steht.',
   '2026-08-01', 'Testautorin', 4,
   (SELECT id FROM media WHERE path = 'test/platzhalter.jpg'),
   (SELECT id FROM categories WHERE slug = 'verband'),
   'published'),
  ('test-zweiter-beitrag',
   'Zweiter Testbeitrag',
   'Noch ein Anriss, damit die Übersicht mehr als eine Karte zeigt.',
   '2026-07-15', NULL, 2, NULL,
   (SELECT id FROM categories WHERE slug = 'kurse'),
   'published');

INSERT INTO `post_sections` (`post_id`, `position`, `text`) VALUES
  ((SELECT id FROM posts WHERE slug = 'test-erster-beitrag'), 0,
   'Erster Abschnitt der Detailseite. Hier steht Fliesstext.'),
  ((SELECT id FROM posts WHERE slug = 'test-erster-beitrag'), 1,
   'Zweiter Abschnitt, damit die Reihenfolge prüfbar ist.');

INSERT INTO `post_section_images` (`section_id`, `media_id`, `position`) VALUES
  ((SELECT id FROM post_sections WHERE post_id = (SELECT id FROM posts WHERE slug = 'test-erster-beitrag') AND position = 0),
   (SELECT id FROM media WHERE path = 'test/platzhalter.jpg'), 0);

INSERT INTO `post_categories` (`post_id`, `category_id`) VALUES
  ((SELECT id FROM posts WHERE slug = 'test-erster-beitrag'),
   (SELECT id FROM categories WHERE slug = 'kurse'));

INSERT INTO `pages` (`slug`, `title`, `body_html`, `status`) VALUES
  ('test-seite', 'Testseite', '<p>Inhalt der Testseite.</p>', 'published');

INSERT INTO `albums` (`slug`, `title`, `excerpt`, `event_date`, `location`, `cover_id`, `status`) VALUES
  ('test-album', 'Testalbum', 'Ein Album zum Prüfen.', '2026-06-01', 'Bern',
   (SELECT id FROM media WHERE path = 'test/platzhalter.jpg'), 'published');

INSERT INTO `album_images` (`album_id`, `media_id`, `position`) VALUES
  ((SELECT id FROM albums WHERE slug = 'test-album'),
   (SELECT id FROM media WHERE path = 'test/platzhalter.jpg'), 0);

INSERT INTO `link_groups` (`name`, `sort`) VALUES ('Test-Rubrik', 10);
INSERT INTO `links` (`group_id`, `title`, `url`, `sort`) VALUES
  ((SELECT id FROM link_groups WHERE name = 'Test-Rubrik'), 'Beispiel', 'https://example.ch', 0);

INSERT INTO `board_members` (`name`, `role`, `ika_function`, `school_name`, `school_url`, `email`, `sort`) VALUES
  ('Testperson', 'Test-Rolle', 'IKA-Lehrperson', 'Testschule', 'https://example.ch', 'test@example.ch', 10);
