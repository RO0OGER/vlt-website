/**
 * Datenmodell und Inhalte der Bildergalerien.
 *
 * Wie bei den Beitraegen sind die Alben noch fest
 * ausprogrammiert, aber so strukturiert, wie eine Datenbank sie spaeter
 * liefern wuerde: keine Inhalte im Template, alles kommt aus diesen Objekten.
 * Die Bildadressen (src) sind heute noch leer – sobald die DB angebunden ist,
 * traegt sie nur die URL nach, der Rest bleibt unveraendert. Bis dahin haelt
 * die Platzhalterflaeche das Seitenverhaeltnis frei.
 */

import { MONTHS_DE_LONG } from '../../shared/dates';

/** Ein einzelnes Bild einer Galerie. */
export interface GalleryImage {
  /** Bildadresse. Fehlt sie, zeigt die Galerie die Platzhalterflaeche. */
  src?: string;
  /** Bildbeschreibung – Pflicht, damit die Seite zugaenglich bleibt. */
  alt: string;
  /**
   * Seitenverhaeltnis als Hoehe/Breite. Es gibt der Masonry-Galerie ihren
   * Rhythmus und haelt den Platz frei, bevor das Bild geladen ist. Spaeter
   * liefert die DB das Verhaeltnis des echten Bildes.
   */
  ratio: number;
}

/** Ein Album – eine Sammlung von Bildern zu einem Anlass. */
export interface GalleryAlbum {
  /** Eindeutige ID – Teil der URL, z. B. /galerie/3. */
  id: number;
  /** ISO-Datum (YYYY-MM-DD) – Grundlage fuer die Sortierung. */
  date: string;
  title: string;
  /** Kurzer Anrisstext fuer die Karte. */
  excerpt: string;
  /** Kategorie – die Filterleiste wird daraus abgeleitet, nie hart gesetzt. */
  cat: string;
  /** Veranstaltungsort, ausgeschrieben, z. B. "Zürich". */
  location?: string;
  /** Titelbild der Karte. Ist es das erste Bild, kann es aus images stammen. */
  cover: GalleryImage;
  /** Die Bilder des Albums – in der Lightbox durchblaetterbar. */
  images: GalleryImage[];
}

export const VLT_ALBUMS: GalleryAlbum[] = [
  {
    id: 1,
    date: '2026-05-24',
    title: 'Jahresversammlung 2026',
    excerpt: 'Eindrücke von der Hauptversammlung mit Rahmenprogramm im Zürcher Kongresshaus.',
    cat: 'Jahresversammlung',
    location: 'Zürich',
    cover: { alt: 'Blick in den vollen Saal während der Jahresversammlung', ratio: 0.66 },
    images: [
      { alt: 'Blick in den vollen Saal während der Jahresversammlung', ratio: 0.66 },
      { alt: 'Begrüssung durch die Präsidentin am Rednerpult', ratio: 0.72 },
      { alt: 'Teilnehmende im Gespräch während der Pause', ratio: 1.4 },
      { alt: 'Abstimmung per Handzeichen im Plenum', ratio: 0.62 },
      { alt: 'Apéro im Foyer des Kongresshauses', ratio: 0.75 },
      { alt: 'Detailaufnahme des Programmhefts', ratio: 1 },
    ],
  },
  {
    id: 2,
    date: '2026-03-14',
    title: 'Herbsttagung Digitalisierung',
    excerpt: 'Workshops, Referate und viel Austausch rund um den digitalen Wandel im Unterricht.',
    cat: 'Tagung',
    location: 'Luzern',
    cover: { alt: 'Referent präsentiert vor grosser Leinwand', ratio: 0.6 },
    images: [
      { alt: 'Referent präsentiert vor grosser Leinwand', ratio: 0.6 },
      { alt: 'Gruppenarbeit an Notebooks im Workshop', ratio: 0.75 },
      { alt: 'Notizen und Post-its an einer Pinnwand', ratio: 1.3 },
      { alt: 'Teilnehmende diskutieren an runden Tischen', ratio: 0.68 },
      { alt: 'Blick über den Vierwaldstättersee vom Tagungsort', ratio: 1.5 },
    ],
  },
  {
    id: 3,
    date: '2026-02-08',
    title: 'Regionaltreffen Ostschweiz',
    excerpt: 'Rund fünfzig Mitglieder trafen sich in St. Gallen zum Austausch bei Kaffee und Gebäck.',
    cat: 'Regionaltreffen',
    location: 'St. Gallen',
    cover: { alt: 'Gruppe von Mitgliedern beim Regionaltreffen', ratio: 0.7 },
    images: [
      { alt: 'Gruppe von Mitgliedern beim Regionaltreffen', ratio: 0.7 },
      { alt: 'Gespräch an einem Stehtisch', ratio: 1.35 },
      { alt: 'Kaffee und Gebäck auf dem Buffet', ratio: 0.8 },
      { alt: 'Blick in den historischen Saal', ratio: 0.64 },
    ],
  },
  {
    id: 4,
    date: '2025-11-19',
    title: 'Weiterbildungstag KI im Unterricht',
    excerpt: 'Praxisnahe Sessions zu KI-Werkzeugen – vom ersten Prompt bis zur fertigen Lektion.',
    cat: 'Weiterbildung',
    location: 'Bern',
    cover: { alt: 'Lernende arbeiten konzentriert an Notebooks', ratio: 0.78 },
    images: [
      { alt: 'Lernende arbeiten konzentriert an Notebooks', ratio: 0.78 },
      { alt: 'Kursleiterin erklärt ein Werkzeug am Beamer', ratio: 0.6 },
      { alt: 'Zwei Teilnehmende lösen gemeinsam eine Aufgabe', ratio: 1.3 },
      { alt: 'Detailaufnahme eines Bildschirms mit Chat-Fenster', ratio: 0.56 },
      { alt: 'Gruppenfoto der Kursklasse', ratio: 0.66 },
    ],
  },
  {
    id: 5,
    date: '2025-09-06',
    title: 'Sommerausflug Tessin',
    excerpt: 'Zwei Tage Netzwerk, Kultur und Sonne – der beliebte Vereinsausflug in den Süden.',
    cat: 'Ausflug',
    location: 'Locarno',
    cover: { alt: 'Palmenpromenade am Lago Maggiore', ratio: 1.5 },
    images: [
      { alt: 'Palmenpromenade am Lago Maggiore', ratio: 1.5 },
      { alt: 'Gruppe wandert auf einem Weg über dem See', ratio: 0.7 },
      { alt: 'Gemeinsames Abendessen auf einer Terrasse', ratio: 0.75 },
      { alt: 'Altstadtgasse mit bunten Fassaden', ratio: 1.35 },
      { alt: 'Bootsfahrt bei Sonnenuntergang', ratio: 0.62 },
      { alt: 'Detailaufnahme einer Kirchenfassade', ratio: 1 },
    ],
  },
  {
    id: 6,
    date: '2025-05-31',
    title: 'Jahresversammlung 2025',
    excerpt: 'Rückblick auf ein bewegtes Verbandsjahr mit Ehrungen langjähriger Mitglieder.',
    cat: 'Jahresversammlung',
    location: 'Olten',
    cover: { alt: 'Ehrung langjähriger Mitglieder auf der Bühne', ratio: 0.68 },
    images: [
      { alt: 'Ehrung langjähriger Mitglieder auf der Bühne', ratio: 0.68 },
      { alt: 'Blick ins Plenum von der Bühne aus', ratio: 1.4 },
      { alt: 'Applaus im Publikum', ratio: 0.72 },
      { alt: 'Blumenstrauss für die scheidende Vorständin', ratio: 0.9 },
    ],
  },
];

/** Filterwert der Kategorie-Leiste, der alle Alben durchlaesst. */
export const ALL_ALBUM_CATEGORIES = 'Alle';

/**
 * Alle vorkommenden Kategorien, aus den Daten abgeleitet. Kommt eine neue
 * Kategorie dazu, erscheint sie ohne Codeaenderung in der Filterleiste.
 */
export function albumCategories(albums: readonly GalleryAlbum[]): string[] {
  return [ALL_ALBUM_CATEGORIES, ...new Set(albums.map((a) => a.cat))];
}

/** Ausgeschriebenes Datum, z. B. "24. Mai 2026". */
export function formatAlbumDate(date: string): string {
  const d = new Date(date + 'T00:00:00');
  return `${d.getDate()}. ${MONTHS_DE_LONG[d.getMonth()]} ${d.getFullYear()}`;
}

/** Alben, neuste zuerst. */
export function sortedAlbums(): GalleryAlbum[] {
  return [...VLT_ALBUMS].sort((a, b) => b.date.localeCompare(a.date));
}
