/**
 * Datenmodell und Inhalte der Beitraege.
 *
 * Wie bei den Verbandsanlaessen sind die Beitraege noch fest ausprogrammiert,
 * aber so strukturiert, wie eine API sie spaeter liefern wuerde: keine Inhalte
 * im Template, alles kommt aus diesen Objekten. Beim Anbinden der API wird
 * VLT_POSTS durch einen Service ersetzt, der dieselbe Struktur liefert – die
 * Galerie bleibt unveraendert.
 */

import { MONTHS_DE_LONG } from '../verbandsanlaesse/events';

/** Titelbild eines Beitrags. */
export interface PostCover {
  /** Bildadresse. Fehlt sie, zeigt die Karte die Platzhalterflaeche. */
  src?: string;
  /** Bildbeschreibung – Pflicht, damit die Seite zugaenglich bleibt. */
  alt: string;
  /**
   * Seitenverhaeltnis als Hoehe/Breite. Es gibt der Masonry-Galerie ihren
   * Rhythmus und haelt den Platz frei, bevor das Bild geladen ist. Spaeter
   * liefert die API das Verhaeltnis des echten Bildes.
   */
  ratio: number;
}

/**
 * Ein Abschnitt der Detailseite: Text mit null bis zwei Bildern. Mehr als
 * zwei Bilder pro Abschnitt zeigt die Seite nicht – das Layout ist auf eine
 * einspaltige und eine zweispaltige Bildreihe ausgelegt.
 */
export interface PostSection {
  text: string;
  images?: PostCover[];
}

export interface BlogPost {
  /** Eindeutige ID – Teil der URL, z. B. /beitraege/7. */
  id: number;
  /** ISO-Datum (YYYY-MM-DD) – Grundlage fuer die Sortierung. */
  date: string;
  title: string;
  /** Anrisstext fuer die Karte. */
  excerpt: string;
  /** Kategorie – die Filterleiste wird daraus abgeleitet, nie hart gesetzt. */
  cat: string;
  /** Geschaetzte Lesedauer, z. B. "6 min". */
  read: string;
  cover: PostCover;
}

/**
 * Alles, was zusaetzlich auf der Detailseite steht. Wie bei den Anlaessen
 * optional: die Galerie braucht diese Felder nicht, und in einem CMS bleiben
 * sie bei vielen Beitraegen leer. Fehlt "sections", zeigt die Detailseite den
 * Anrisstext – so bleibt sie auch fuer nur angerissene Beitraege lesbar.
 */
export interface PostDetail extends BlogPost {
  /** Verfasserin oder Verfasser, ausgeschrieben, z. B. "Sandra Meier". */
  author?: string;
  /** Weitere Kategorien neben "cat" – nur fuer die Kopfzeile der Detailseite. */
  categories?: string[];
  /** Fliesstext, ein Eintrag je Abschnitt. */
  sections?: PostSection[];
}

export const VLT_POSTS: PostDetail[] = [
  // Vollstaendig gepflegtes Beispiel – zeigt alle Felder der Detailseite.
  {
    id: 1,
    date: '2026-05-24',
    title: 'Digitalisierung im kaufmännischen Bereich',
    excerpt:
      'Erfahren Sie, wie moderne Technologien den kaufmännischen Alltag verändern und wie Sie davon profitieren können.',
    cat: 'Digitalisierung',
    read: '6 min',
    cover: { alt: 'Arbeitsplatz mit digitalen Werkzeugen', ratio: 0.72 },
    author: 'Sandra Meier',
    categories: ['Bildung'],
    sections: [
      {
        text: 'Die Digitalisierung verändert nicht nur Werkzeuge, sondern auch die Art, wie Lehrende ihren Unterricht gestalten. Wer früh den Zugang zu neuen Systemen findet, kann diesen Wandel aktiv mitgestalten statt ihn nur zu verwalten.',
        images: [{ alt: 'Lehrperson am digitalen Arbeitsplatz', ratio: 0.5 }],
      },
      {
        text: 'In der Praxis zeigt sich: kleine, iterative Schritte funktionieren besser als grosse Systemwechsel. Lehrkräfte berichten von deutlich höherer Akzeptanz, wenn neue Werkzeuge schrittweise in bestehende Abläufe eingebunden werden – begleitet von klaren Beispielen aus dem Schulalltag.',
        images: [
          { alt: 'Lernende arbeiten in Gruppen an Notebooks', ratio: 0.75 },
          { alt: 'Notizen zur Unterrichtsplanung', ratio: 0.75 },
        ],
      },
      {
        text: 'Drei Aspekte haben sich als besonders wirksam erwiesen: eine klare Kommunikation der Ziele, ausreichend Zeit für Weiterbildung und ein Netzwerk von Kolleginnen und Kollegen, die Erfahrungen teilen. Der vlt unterstützt genau diesen Austausch – durch Veranstaltungen, Materialien und den direkten Kontakt zwischen Lehrenden.',
      },
      {
        text: 'Wer sich vertieft mit dem Thema auseinandersetzen möchte, findet in den kommenden Veranstaltungen des Verbands passende Formate – von kompakten Workshops bis zu ganztägigen Tagungen.',
        images: [{ alt: 'Teilnehmende an einem Workshop des Verbands', ratio: 0.5 }],
      },
    ],
  },
  {
    id: 2,
    date: '2026-05-18',
    title: 'Technische Grundlagen für Lehrende',
    excerpt:
      'Vertiefen Sie Ihr technisches Wissen, um Ihre Unterrichtsinhalte noch praxisnäher zu gestalten.',
    cat: 'Lehre',
    read: '8 min',
    cover: { alt: 'Lehrperson erklärt einen technischen Aufbau', ratio: 0.52 },
  },
  {
    id: 3,
    date: '2026-05-11',
    title: 'Netzwerken und Erfahrungsaustausch',
    excerpt:
      'Nutzen Sie unsere Veranstaltungen, um sich mit Kolleginnen und Kollegen auszutauschen und neue Impulse zu erhalten.',
    cat: 'Netzwerk',
    read: '4 min',
    cover: { alt: 'Teilnehmende im Gespräch während einer Pause', ratio: 1 },
  },
  {
    id: 4,
    date: '2026-05-04',
    title: 'Cloud-Technologien im Büroalltag',
    excerpt:
      'Lernen Sie, wie Cloud-Lösungen Ihre Arbeitsprozesse effizienter machen und wo die Grenzen liegen.',
    cat: 'Digitalisierung',
    read: '5 min',
    cover: { alt: 'Serverraum mit Netzwerkschränken', ratio: 0.6 },
  },
  {
    id: 5,
    date: '2026-04-28',
    title: 'IT-Sicherheit für Lehrende',
    excerpt:
      'Schützen Sie Ihre Daten und die Ihrer Lernenden mit praxisnahen Sicherheitstipps für den Schulalltag.',
    cat: 'IT-Sicherheit',
    read: '7 min',
    cover: { alt: 'Schloss-Symbol auf einem Bildschirm', ratio: 0.84 },
  },
  {
    id: 6,
    date: '2026-04-21',
    title: 'Datenanalyse und Reporting',
    excerpt:
      'Verstehen Sie, wie Sie Daten sinnvoll auswerten und Ergebnisse verständlich präsentieren.',
    cat: 'Daten',
    read: '9 min',
    cover: { alt: 'Auswertung mit Diagrammen auf einem Tisch', ratio: 0.56 },
  },
  {
    id: 7,
    date: '2026-04-09',
    title: 'KI-Werkzeuge im Unterricht einsetzen',
    excerpt:
      'Ein Überblick über Werkzeuge, die im Unterricht wirklich helfen – und über die Fragen, die sie aufwerfen.',
    cat: 'Digitalisierung',
    read: '10 min',
    cover: { alt: 'Lernende arbeiten an Notebooks', ratio: 0.78 },
  },
  {
    id: 8,
    date: '2026-03-26',
    title: 'BIVO 2022 – eine Zwischenbilanz',
    excerpt:
      'Vier Jahre nach der Einführung: Was sich im kaufmännischen Unterricht bewährt hat und wo es hakt.',
    cat: 'Bildungspolitik',
    read: '11 min',
    cover: { alt: 'Unterlagen zur Bildungsverordnung auf einem Pult', ratio: 0.5 },
  },
  {
    id: 9,
    date: '2026-03-12',
    title: 'Weiterbildung planen – Schritt für Schritt',
    excerpt:
      'Von der Standortbestimmung bis zur Finanzierung: So kommen Sie zu einer Weiterbildung, die passt.',
    cat: 'Lehre',
    read: '6 min',
    cover: { alt: 'Jahresplanung an einer Pinnwand', ratio: 0.92 },
  },
  {
    id: 10,
    date: '2026-02-27',
    title: 'Die Stimme der Lehrenden in Bern',
    excerpt:
      'Wie der Verband bildungspolitische Anliegen einbringt und welche Geschäfte 2026 anstehen.',
    cat: 'Bildungspolitik',
    read: '7 min',
    cover: { alt: 'Bundeshaus in Bern', ratio: 0.66 },
  },
  {
    id: 11,
    date: '2026-02-13',
    title: 'Rückblick Regionaltreffen Ostschweiz',
    excerpt:
      'Rund fünfzig Mitglieder trafen sich in St. Gallen zum Austausch über Unterrichtsentwicklung.',
    cat: 'Netzwerk',
    read: '3 min',
    cover: { alt: 'Gruppe von Mitgliedern beim Regionaltreffen', ratio: 0.7 },
  },
  {
    id: 12,
    date: '2026-01-30',
    title: 'Passwörter, Phishing und zwei Faktoren',
    excerpt:
      'Die drei häufigsten Einfallstore an Schulen – und was sich mit wenig Aufwand dagegen tun lässt.',
    cat: 'IT-Sicherheit',
    read: '5 min',
    cover: { alt: 'Anmeldemaske mit Zwei-Faktor-Abfrage', ratio: 0.88 },
  },
];

/** Filterwert der Kategorie-Leiste, der alle Beitraege durchlaesst. */
export const ALL_CATEGORIES = 'Alle';

/**
 * Alle vorkommenden Kategorien, aus den Daten abgeleitet. Kommt eine neue
 * Kategorie dazu, erscheint sie ohne Codeaenderung in der Filterleiste.
 */
export function postCategories(posts: readonly BlogPost[]): string[] {
  return [ALL_CATEGORIES, ...new Set(posts.map((p) => p.cat))];
}

/** Ausgeschriebenes Datum, z. B. "24. Mai 2026". */
export function formatPostDate(date: string): string {
  const d = new Date(date + 'T00:00:00');
  return `${d.getDate()}. ${MONTHS_DE_LONG[d.getMonth()]} ${d.getFullYear()}`;
}

/** Beitraege, neuste zuerst. */
export function sortedPosts(): PostDetail[] {
  return [...VLT_POSTS].sort((a, b) => b.date.localeCompare(a.date));
}

/**
 * Sucht einen Beitrag anhand seiner ID. Der Wert kommt als Zeichenkette aus
 * der URL und kann alles enthalten – ungueltige Werte ergeben undefined, die
 * Detailseite zeigt dann ihren "nicht gefunden"-Zustand.
 */
export function findPost(id: string | null): PostDetail | undefined {
  if (!id) return undefined;
  const n = Number(id);
  return Number.isInteger(n) ? VLT_POSTS.find((p) => p.id === n) : undefined;
}
