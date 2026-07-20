/**
 * Datenmodell und Inhalte der Verbandsanlaesse.
 *
 * Die Termine sind noch fest ausprogrammiert, aber bewusst so strukturiert,
 * wie ein CMS sie spaeter liefern wuerde: keine Inhalte im Template, alles
 * kommt aus diesen Objekten. Beim Anbinden eines CMS wird VLT_EVENTS durch
 * einen Service ersetzt, der dieselbe Struktur liefert – Zeitstrahl, Liste und
 * Detailseite bleiben unveraendert.
 *
 * Pflichtfelder hat jeder Anlass. Alles Optionale blendet die Detailseite aus,
 * wenn es nicht gepflegt ist – im CMS bleiben solche Felder oft leer.
 */

/** Veranstaltungsort, ausgeschrieben und mit Koordinaten fuer die Karte. */
export interface EventLocation {
  /** Ausgeschriebener Name, z. B. "KV Zürich Business School". */
  name: string;
  street: string;
  zip: string;
  city: string;
  lat: number;
  lon: number;
}

/** Ein Bild im Karussell der Detailseite. */
export interface EventPhoto {
  /** Bildadresse. Fehlt sie, zeigt das Karussell die Platzhalterflaeche. */
  src?: string;
  /** Platzhalterfarbe, solange kein Bild gepflegt ist. */
  color?: string;
  /** Bildbeschreibung – Pflicht, damit die Seite zugaenglich bleibt. */
  alt: string;
}

/** Verlinktes Dokument, z. B. Programm oder Anmeldeformular als PDF. */
export interface EventDocument {
  label: string;
  href: string;
  /** Format und Groesse, z. B. "PDF · 240 KB". */
  meta?: string;
}

/** Eine Preisstufe – Verbaende unterscheiden meist Mitglieder und Gaeste. */
export interface PriceTier {
  label: string;
  value: string;
}

/** Pflichtangaben – reichen fuer Zeitstrahl und Liste. */
export interface VltEvent {
  /** Eindeutige ID – Teil der URL, z. B. /verbandsanlaesse/9. */
  id: number;
  /** ISO-Datum (YYYY-MM-DD) – Grundlage fuer Sortierung und Zeitstrahl. */
  date: string;
  /** Titel des Anlasses. */
  t: string;
  /** Kurzbeschreibung. */
  d: string;
  tag: 'Mitglieder' | 'Offen';
  /** Platzhalterfarbe der Bildflaeche in der Detailkarte des Zeitstrahls. */
  img: string;
  /** Kleiner Untertitel ueber dem Titel, z. B. "Workshop / Weiterbildung". */
  kicker: string;
  /** Kurzcode fuer Drucksachen – fuehrt Besucher direkt auf diese Seite. */
  webcode: string;
  /** Beginn als "HH:MM". */
  start: string;
  location: EventLocation;
}

/** Alles, was zusaetzlich auf der Detailseite steht. */
export interface EventDetail extends VltEvent {
  /** Ende als "HH:MM". Ohne Angabe rechnet der Kalendereintrag mit zwei Stunden. */
  end?: string;
  photos?: EventPhoto[];
  /** Ueberschrift des Textabschnitts. */
  bodyTitle?: string;
  /** Fliesstext, ein Eintrag je Absatz. */
  body?: string[];
  documents?: EventDocument[];
  /** Ziel des Anmelde-Buttons. */
  registrationUrl?: string;
  prices?: PriceTier[];
  categories?: string[];
  audience?: string[];
  /** Zutrittskonditionen, z. B. "Nur für Mitglieder, Anmeldung erforderlich." */
  admission?: string;
}

export const MONTHS_DE = [
  'Jan',
  'Feb',
  'Mär',
  'Apr',
  'Mai',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Okt',
  'Nov',
  'Dez',
];

/** Ausgeschriebene Monate fuer Datumsangaben auf der Detailseite. */
export const MONTHS_DE_LONG = [
  'Januar',
  'Februar',
  'März',
  'April',
  'Mai',
  'Juni',
  'Juli',
  'August',
  'September',
  'Oktober',
  'November',
  'Dezember',
];

export const WEEKDAYS_DE = [
  'Sonntag',
  'Montag',
  'Dienstag',
  'Mittwoch',
  'Donnerstag',
  'Freitag',
  'Samstag',
];

// ── Orte ─────────────────────────────────────────────────────────
// Wiederverwendet, weil der Verband dieselben Haeuser mehrfach bespielt.
// Koordinaten sind Naeherungswerte und gehoeren spaeter ins CMS.

const KV_ZUERICH: EventLocation = {
  name: 'KV Zürich Business School',
  street: 'Limmatstrasse 310',
  zip: '8005',
  city: 'Zürich',
  lat: 47.3906,
  lon: 8.525,
};

const HOTEL_KREUZ_BERN: EventLocation = {
  name: 'Hotel Kreuz Bern',
  street: 'Zeughausgasse 41',
  zip: '3011',
  city: 'Bern',
  lat: 46.9489,
  lon: 7.4474,
};

const BZW_ST_GALLEN: EventLocation = {
  name: 'Berufs- und Weiterbildungszentrum St. Gallen',
  street: 'Kreuzbleicheweg 4',
  zip: '9000',
  city: 'St. Gallen',
  lat: 47.4235,
  lon: 9.3667,
};

const KKL_LUZERN: EventLocation = {
  name: 'KKL Luzern',
  street: 'Europaplatz 1',
  zip: '6005',
  city: 'Luzern',
  lat: 47.0503,
  lon: 8.3117,
};

export const VLT_EVENTS: EventDetail[] = [
  // ── Vergangene Jahrgaenge – Platzhalter, bis die echten Anlaesse
  //    nachgetragen sind. Sie erscheinen erst, wenn man sie nachlaedt.
  {
    id: 1,
    date: '2024-02-14',
    t: 'Neujahrsapéro',
    d: 'Get-together zum Jahresauftakt.',
    tag: 'Offen',
    img: '#3a3a8f',
    kicker: 'Netzwerk-Apéro / Get-together',
    webcode: 'VLT-240214',
    start: '18:00',
    end: '21:00',
    location: HOTEL_KREUZ_BERN,
  },
  {
    id: 2,
    date: '2024-06-14',
    t: 'Delegiertenversammlung',
    d: 'Jahresversammlung mit Wahlen.',
    tag: 'Mitglieder',
    img: '#2F2F7F',
    kicker: 'Jahresversammlung / Statutarischer Anlass',
    webcode: 'VLT-240614',
    start: '13:30',
    end: '17:00',
    location: KV_ZUERICH,
  },
  {
    id: 3,
    date: '2024-11-06',
    t: 'Weiterbildungstag',
    d: 'Praxisnahe Kurse für Lehrende.',
    tag: 'Offen',
    img: '#c9c9c3',
    kicker: 'Weiterbildung / Kurstag',
    webcode: 'VLT-241106',
    start: '09:00',
    end: '16:30',
    location: BZW_ST_GALLEN,
  },
  {
    id: 4,
    date: '2025-02-12',
    t: 'Neujahrsapéro',
    d: 'Get-together zum Jahresauftakt.',
    tag: 'Offen',
    img: '#3a3a8f',
    kicker: 'Netzwerk-Apéro / Get-together',
    webcode: 'VLT-250212',
    start: '18:00',
    end: '21:00',
    location: HOTEL_KREUZ_BERN,
  },
  {
    id: 5,
    date: '2025-06-13',
    t: 'Delegiertenversammlung',
    d: 'Jahresversammlung mit Wahlen und Jahresbericht.',
    tag: 'Mitglieder',
    img: '#2F2F7F',
    kicker: 'Jahresversammlung / Statutarischer Anlass',
    webcode: 'VLT-250613',
    start: '13:30',
    end: '17:00',
    location: KV_ZUERICH,
  },
  {
    id: 6,
    date: '2025-10-08',
    t: 'Herbsttagung',
    d: 'Fachtagung zu aktuellen Bildungsthemen.',
    tag: 'Mitglieder',
    img: '#4a4a9f',
    kicker: 'Fachtagung / Vortrag',
    webcode: 'VLT-251008',
    start: '09:30',
    end: '17:00',
    location: KKL_LUZERN,
  },

  // ── Laufendes und kommendes Jahr ────────────────────────────────
  {
    id: 7,
    date: '2026-02-11',
    t: 'Neujahrsapéro',
    d: 'Get-together zum Jahresauftakt mit Ausblick.',
    tag: 'Offen',
    img: '#3a3a8f',
    kicker: 'Netzwerk-Apéro / Get-together',
    webcode: 'VLT-260211',
    start: '18:00',
    end: '21:00',
    location: HOTEL_KREUZ_BERN,
  },

  // Vollstaendig gepflegtes Beispiel – zeigt alle Felder der Detailseite.
  {
    id: 8,
    date: '2026-06-12',
    t: 'Delegiertenversammlung 2026',
    d: 'Jahresversammlung mit Wahlen und Ausblick auf 2027.',
    tag: 'Mitglieder',
    img: '#2F2F7F',
    kicker: 'Jahresversammlung / Statutarischer Anlass',
    webcode: 'VLT-260612',
    start: '13:30',
    end: '17:00',
    location: KV_ZUERICH,
    photos: [
      { color: '#2F2F7F', alt: 'Blick in den Saal während der Delegiertenversammlung' },
      { color: '#3a3a8f', alt: 'Vorstandsmitglieder auf dem Podium' },
      { color: '#c9c9c3', alt: 'Delegierte bei der Abstimmung' },
      { color: '#d9951f', alt: 'Apéro im Foyer nach der Versammlung' },
    ],
    bodyTitle: 'Weichenstellung für das Verbandsjahr',
    body: [
      'Die Delegiertenversammlung ist der wichtigste statutarische Anlass des Verbands. Die Delegierten der Sektionen entscheiden über Jahresrechnung, Budget und die strategischen Schwerpunkte des kommenden Jahres.',
      'Im Anschluss an den geschäftlichen Teil stellt der Vorstand die Schwerpunkte für 2027 vor. Danach bleibt beim Apéro Zeit für den persönlichen Austausch.',
    ],
    documents: [
      { label: 'Traktandenliste', href: '#', meta: 'PDF · 180 KB' },
      { label: 'Jahresbericht 2025', href: '#', meta: 'PDF · 2.4 MB' },
      { label: 'Jahresrechnung 2025', href: '#', meta: 'PDF · 640 KB' },
      { label: 'Anträge der Sektionen', href: '#', meta: 'PDF · 320 KB' },
    ],
    registrationUrl: '#',
    prices: [
      { label: 'Delegierte', value: 'kostenlos' },
      { label: 'Mitglieder als Gäste', value: 'CHF 30.–' },
    ],
    categories: ['Verbandsleben', 'Jahresversammlung', 'Politik & Strategie'],
    audience: ['Delegierte der Sektionen', 'Vorstandsmitglieder', 'Mitglieder als Gäste'],
    admission:
      'Nur für Mitglieder. Delegierte sind stimmberechtigt, weitere Mitglieder können als Gäste ohne Stimmrecht teilnehmen. Anmeldung bis zwei Wochen vor dem Anlass erforderlich.',
  },

  {
    id: 9,
    date: '2026-09-04',
    t: 'KI im Unterricht',
    d: 'Workshop zu praxisnahem KI-Einsatz im Schulalltag.',
    tag: 'Offen',
    img: '#c9c9c3',
    kicker: 'Workshop / Weiterbildung (Digitalisierung)',
    webcode: 'VLT-260904',
    start: '09:00',
    end: '16:00',
    location: HOTEL_KREUZ_BERN,
  },
  {
    id: 10,
    date: '2026-11-03',
    t: 'Herbsttagung',
    d: 'Fachtagung zu aktuellen Bildungsthemen.',
    tag: 'Mitglieder',
    img: '#4a4a9f',
    kicker: 'Fachtagung / Vortrag',
    webcode: 'VLT-261103',
    start: '09:30',
    end: '17:00',
    location: KKL_LUZERN,
  },
  {
    id: 11,
    date: '2026-11-12',
    t: 'Netzwerk-Apéro Ost',
    d: 'Regionaltreffen Ostschweiz zum Austausch.',
    tag: 'Offen',
    img: '#e5e5df',
    kicker: 'Regionaltreffen / Netzwerk',
    webcode: 'VLT-261112',
    start: '18:00',
    end: '21:00',
    location: BZW_ST_GALLEN,
  },

  // Zweites vollstaendiges Beispiel.
  {
    id: 12,
    date: '2026-11-20',
    t: 'Digitaler Wandel im Klassenzimmer',
    d: 'Tagung zu Chancen und Herausforderungen im Schulalltag.',
    tag: 'Mitglieder',
    img: '#262676',
    kicker: 'Wirtschafts-Vortrag / Podium, Workshop (Wirtschaftsthema)',
    webcode: 'VLT-261120',
    start: '09:30',
    end: '17:00',
    location: KKL_LUZERN,
    photos: [
      { color: '#262676', alt: 'Podiumsdiskussion auf der Bühne des KKL' },
      { color: '#4a4a9f', alt: 'Teilnehmende im Workshop' },
      { color: '#d9951f', alt: 'Referentin während des Hauptvortrags' },
      { color: '#c9c9c3', alt: 'Ausstellungsstände im Foyer' },
      { color: '#e5e5df', alt: 'Networking in der Kaffeepause' },
    ],
    bodyTitle: 'Zwischen Werkzeug und Wandel',
    body: [
      'Der digitale Wandel verändert nicht nur die Werkzeuge im Klassenzimmer, sondern auch die Rolle der Lehrenden. Die Tagung beleuchtet, was das für den kaufmännischen und technischen Unterricht konkret bedeutet.',
      'Am Vormittag ordnen ein Hauptvortrag und ein Podium mit Vertreterinnen aus Wirtschaft, Bildungspolitik und Schulleitung das Thema ein. Am Nachmittag stehen vier parallele Workshops zur Wahl, in denen die Ansätze direkt an eigenen Unterrichtsbeispielen erprobt werden.',
      'Die Tagung schliesst mit einer moderierten Schlussrunde, in der die Ergebnisse aus den Workshops zusammengeführt werden.',
    ],
    documents: [
      { label: 'Detailprogramm', href: '#', meta: 'PDF · 420 KB' },
      { label: 'Workshop-Übersicht', href: '#', meta: 'PDF · 260 KB' },
      { label: 'Anreise und Parkmöglichkeiten', href: '#', meta: 'PDF · 90 KB' },
    ],
    registrationUrl: '#',
    prices: [
      { label: 'Mitglieder', value: 'CHF 120.–' },
      { label: 'Nichtmitglieder', value: 'CHF 180.–' },
      { label: 'Studierende und Pensionierte', value: 'CHF 60.–' },
    ],
    categories: ['Digitalisierung', 'Wirtschaft', 'Fachtagung', 'Unterrichtsentwicklung'],
    audience: [
      'Lehrende für Technik und Kaufmannschaft',
      'Schulleitungen',
      'Verantwortliche für Unterrichtsentwicklung',
    ],
    admission:
      'Mitglieder haben Vorrang; freie Plätze werden vier Wochen vor der Tagung für Nichtmitglieder freigegeben. Die Workshops am Nachmittag haben begrenzte Plätze und werden bei der Anmeldung gewählt.',
  },

  {
    id: 13,
    date: '2027-02-09',
    t: 'Neujahrsapéro',
    d: 'Get-together zum Jahresauftakt.',
    tag: 'Offen',
    img: '#3a3a8f',
    kicker: 'Netzwerk-Apéro / Get-together',
    webcode: 'VLT-270209',
    start: '18:00',
    end: '21:00',
    location: HOTEL_KREUZ_BERN,
  },
  {
    id: 14,
    date: '2027-03-15',
    t: 'Frühlingstagung',
    d: 'Impulse und Austausch für das neue Schuljahr.',
    tag: 'Offen',
    img: '#d9951f',
    kicker: 'Fachtagung / Impulsreferate',
    webcode: 'VLT-270315',
    start: '09:30',
    end: '16:30',
    location: KKL_LUZERN,
  },
];

/** Parst ein ISO-Datum als lokales Datum (ohne UTC-Verschiebung). */
export function parseDate(date: string): Date {
  return new Date(date + 'T00:00:00');
}

/** Jahr eines Termins. */
export function eventYear(ev: VltEvent): number {
  return Number(ev.date.slice(0, 4));
}

/**
 * Laufendes Jahr – die Grenze, ab der Anlaesse ohne Zutun angezeigt werden.
 * Aeltere Jahrgaenge blendet die Seite erst auf Klick ein.
 */
export function currentYear(): number {
  return new Date().getFullYear();
}

/**
 * Sucht einen Anlass anhand seiner ID. Der Parameter kommt als Zeichenkette
 * aus der URL und kann alles enthalten – ungueltige Werte ergeben undefined.
 */
export function findEvent(id: string | null): EventDetail | undefined {
  if (!id) return undefined;
  const n = Number(id);
  return Number.isInteger(n) ? VLT_EVENTS.find((ev) => ev.id === n) : undefined;
}

/** Heute als ISO-Datum – dieselbe Schreibweise wie EventDetail.date. */
function todayIso(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

/**
 * Anlaesse ab heute, aufsteigend sortiert – fuer "Kommende Anlässe" auf der
 * Startseite. Bewusst tagesgenau: ein Anlass vom Juni ist im Juli vorbei,
 * auch wenn das Jahr noch laeuft.
 */
export function upcomingEvents(limit?: number): EventDetail[] {
  const today = todayIso();
  const list = VLT_EVENTS.filter((ev) => ev.date >= today).sort((a, b) =>
    a.date.localeCompare(b.date),
  );
  return limit === undefined ? list : list.slice(0, limit);
}
