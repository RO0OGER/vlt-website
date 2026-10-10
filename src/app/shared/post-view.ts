import {
  ApiDocument,
  ApiEvent,
  ApiImage,
  ApiLocation,
  ApiPost,
  ApiPostDetail,
  ApiPrice,
  ApiSection,
  ApiSectionKind,
  ApiTable,
} from './content-api';
import { MONTHS_DE_SHORT, formatDateLong, formatDateWithWeekday, formatTimeRange } from './dates';
import { directionsToAddress, directionsUrl, openStreetMapUrl } from './map/geo';

/**
 * Umformung der API-Antworten in die Form, die die Templates erwarten.
 *
 * Die Vorlagen der Beitragsseiten sind auf feste Felder ausgelegt (cat,
 * cover mit Seitenverhaeltnis). Die API liefert dieselben Angaben, nur anders
 * benannt und teils leer. Diese Datei ist die einzige Stelle, an der beides
 * zusammenkommt – aendert sich die API, wird nur hier angepasst.
 */

/**
 * Seitenverhaeltnis (Hoehe/Breite), wenn die Masse fehlen.
 * Entspricht 3:2 im Querformat und haelt in der Masonry-Galerie einen
 * plausiblen Platz frei, bevor das Bild geladen ist.
 */
const DEFAULT_RATIO = 0.667;

/** Bild, wie die Templates es brauchen: ratio ist immer gesetzt. */
export interface ViewImage {
  src?: string;
  alt: string;
  ratio: number;
}

export interface PostCard {
  /** Teil der URL: /beitraege/<slug> */
  slug: string;
  title: string;
  excerpt: string;
  /** Hauptkategorie, ausgeschrieben – sie steht auf der Karte. */
  cat: string;
  /** Alle Kategorien des Beitrags. Danach filtert die Uebersicht. */
  cats: string[];
  /** ISO-Datum, fuer das datetime-Attribut. */
  date: string;
  /** Ausgeschriebenes Datum fuer die Anzeige. */
  dateLabel: string;
  cover: ViewImage;
}

/** Eine Tabelle, wie die Detailseite sie darstellt. */
export interface TableView {
  /**
   * Die Kopfzeile, oder leer wenn die Tabelle keine hat. So muss die Vorlage
   * nicht zwei Dinge wissen (gibt es eine Kopfzeile, und welche Zeile ist
   * es) – sie fragt nur, ob hier etwas steht.
   */
  head: string[];
  /** Die Zeilen des Rumpfes, ohne die Kopfzeile. */
  rows: string[][];
}

/** Eine Datei zum Herunterladen, wie die Detailseite sie darstellt. */
export interface DocumentView {
  label: string;
  href: string;
  /** Kurzform des Typs fuer das Abzeichen: "PDF", "DOCX" … */
  type: string;
  /** Lesbare Groesse, z. B. "1,2 MB". Leer, wenn sie nicht gepflegt ist. */
  size: string;
}

/** Ein Standort, wie die Detailseite ihn darstellt. */
export interface MapSpot {
  lat: number;
  lng: number;
  zoom: number;
  /** Derselbe Ort bei OpenStreetMap – dort laesst er sich verschieben. */
  mapHref: string;
  /** Wegbeschreibung dorthin. */
  routeHref: string;
}

/**
 * Ein Abschnitt, wie die Detailseite ihn darstellt.
 *
 * Die Art entscheidet ueber die Darstellung: Fliesstext, Zwischentitel,
 * Zitat, Bild, Tabelle, Download-Liste, Verweis oder Karte. Sie kommt aus
 * dem Block-Editor im CMS. Beitraege aus der WordPress-Migration haben keine
 * Art gepflegt und sind darum Fliesstext – genau das, was sie vorher auch
 * waren.
 */
export interface SectionView {
  kind: ApiSectionKind;
  text: string;
  images: ViewImage[];
  /** Ziel des Link-Abschnitts; bei allen anderen Arten leer. */
  href: string;
  /** Linktext: der Titel, und wenn keiner gepflegt ist, die Adresse selbst. */
  linkLabel: string;
  /** Verlaesst der Link die Seite? Dann oeffnet er in einem neuen Fenster. */
  external: boolean;
  table: TableView | null;
  documents: DocumentView[];
  /** Standort des Karten-Abschnitts; bei allen anderen Arten null. */
  map: MapSpot | null;
}

/**
 * Die Angaben eines Events, wie die Detailseite sie zeigt. Leere Angaben
 * sind leer ('' oder []) – die Vorlage blendet aus, was nicht gepflegt ist.
 */
export interface EventInfo {
  /** ISO-Datum fuer das datetime-Attribut. */
  date: string;
  /** Ausgeschrieben mit Wochentag: "Mittwoch, 4. November 2026". */
  dateLabel: string;
  /** "HH:MM" fuer den Kalendereintrag, leer ohne Angabe. */
  start: string;
  end: string;
  /** "17.30 – 21.00 Uhr", leer ohne Beginn. */
  time: string;
  kicker: string;
  location: string;
  street: string;
  city: string;
  /** Ort, Strasse und PLZ/Ort in einer Zeile – fuer Kalender und Route. */
  address: string;
  routeHref: string;
  prices: ApiPrice[];
  registrationUrl: string;
  /** Fuehrt die Anmeldung von der Seite weg? Dann in einem neuen Fenster. */
  registrationExternal: boolean;
  audience: string[];
  admission: string;
  membersOnly: boolean;
}

export interface PostView extends PostCard {
  author: string | null;
  categories: string[];
  sections: SectionView[];
  /** Nur bei Events gesetzt. */
  event: EventInfo | null;
}

/** Ein Event in der Uebersicht. */
export interface EventCard {
  slug: string;
  title: string;
  excerpt: string;
  /** Kategorie oder leer. */
  cat: string;
  date: string;
  dateLabel: string;
  /** Fuer das Datumsblatt auf der Karte. */
  day: string;
  month: string;
  year: string;
  time: string;
  location: string;
  kicker: string;
  membersOnly: boolean;
  cover: ViewImage;
}

/** Ohne Bild bleibt src leer – die Templates zeigen dann die Platzhalterflaeche. */
export function toViewImage(img: ApiImage | null, fallbackAlt = ''): ViewImage {
  if (!img) return { alt: fallbackAlt, ratio: DEFAULT_RATIO };
  return {
    src: img.src,
    alt: img.alt || fallbackAlt,
    ratio: img.ratio ?? DEFAULT_RATIO,
  };
}

export function toPostCard(p: ApiPost): PostCard {
  const cat = p.category ?? 'Ohne Kategorie';

  return {
    slug: p.slug,
    title: p.title,
    excerpt: p.excerpt,
    cat,
    // Faellt die Liste leer aus (alte Antwort ohne das Feld, oder ein
    // Beitrag ganz ohne Kategorie), bleibt wenigstens die Hauptkategorie –
    // sonst waere der Beitrag ueber die Filterleiste nicht erreichbar.
    cats: p.categories?.length ? p.categories : [cat],
    date: p.date,
    dateLabel: formatDateLong(p.date),
    cover: toViewImage(p.cover, p.title),
  };
}

/**
 * Kurzform des Dateityps fuer das Abzeichen neben einem Download.
 *
 * Die Liste deckt ab, was das CMS annimmt. Alles andere – etwa ein PDF aus
 * der WordPress-Migration, dessen Typ damals anders geschrieben wurde –
 * bekommt die Endung aus der Adresse. Bleibt auch die leer, steht "Datei"
 * da; ein Abzeichen ohne Text waere nur ein Fleck.
 */
const DOCUMENT_TYPES: Record<string, string> = {
  'application/pdf': 'PDF',
  'application/msword': 'DOC',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'DOCX',
  'application/vnd.ms-excel': 'XLS',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'XLSX',
  'application/vnd.ms-powerpoint': 'PPT',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'PPTX',
};

function documentType(doc: ApiDocument): string {
  const known = DOCUMENT_TYPES[doc.mime];
  if (known) return known;

  const extension = doc.href.split('?')[0].split('.').pop() ?? '';
  return /^[a-z0-9]{1,5}$/i.test(extension) ? extension.toUpperCase() : 'Datei';
}

/**
 * Dateigroesse in der Schreibweise, die hier ueblich ist: Komma als
 * Dezimaltrennzeichen, und keine Stellen, die niemand braucht – "1,2 MB"
 * sagt genauso viel wie "1,23 MB", aber "0,4 MB" sagt weniger als "412 KB".
 */
function formatBytes(bytes: number | null): string {
  if (bytes === null || bytes <= 0) return '';
  if (bytes < 1024) return `${bytes} B`;

  const kb = bytes / 1024;
  if (kb < 1000) return `${Math.round(kb)} KB`;

  return `${(kb / 1024).toFixed(1).replace('.', ',')} MB`;
}

function toDocumentView(doc: ApiDocument): DocumentView {
  return {
    // Ohne Beschriftung waere die Zeile unsichtbar. Die API fuellt sie beim
    // Speichern mit dem Dateinamen; fuer alles, was aelter ist, hier noch
    // einmal dasselbe.
    label: doc.label || (doc.href.split('/').pop() ?? 'Dokument'),
    href: doc.href,
    type: documentType(doc),
    size: formatBytes(doc.bytes),
  };
}

/**
 * Trennt die Kopfzeile vom Rumpf. Hat die Tabelle keine Kopfzeile, bleibt
 * head leer und alle Zeilen stehen im Rumpf.
 */
function toTableView(table: ApiTable | null): TableView | null {
  if (!table || table.rows.length === 0) return null;
  if (!table.head) return { head: [], rows: table.rows };
  return { head: table.rows[0], rows: table.rows.slice(1) };
}

function toMapSpot(location: ApiLocation | null | undefined): MapSpot | null {
  if (!location) return null;
  return {
    lat: location.lat,
    lng: location.lng,
    zoom: location.zoom,
    mapHref: openStreetMapUrl(location, location.zoom),
    routeHref: directionsUrl(location),
  };
}

function toSectionView(s: ApiSection): SectionView {
  const href = s.url ?? '';
  return {
    // Aeltere Antworten ohne kind gelten als Fliesstext.
    kind: s.kind ?? 'text',
    text: s.text,
    images: s.images.map((img) => toViewImage(img)),
    href,
    linkLabel: s.text.trim() || href,
    // Eine Adresse der eigenen Seite beginnt mit "/". Alles andere fuehrt
    // weg – und soll das aktuelle Fenster nicht mitnehmen.
    external: href !== '' && !href.startsWith('/'),
    table: toTableView(s.table ?? null),
    documents: (s.documents ?? []).map(toDocumentView),
    map: toMapSpot(s.location),
  };
}

/**
 * Ein Abschnitt mit bloss einem Absatz Text.
 *
 * Die Detailseite braucht ihn, wenn ein Beitrag noch keine Abschnitte hat
 * und stattdessen der Anrisstext dastehen soll.
 */
export function textSection(text: string): SectionView {
  return {
    kind: 'text',
    text,
    images: [],
    href: '',
    linkLabel: '',
    external: false,
    table: null,
    documents: [],
    map: null,
  };
}

export function toPostView(p: ApiPostDetail): PostView {
  return {
    ...toPostCard(p),
    author: p.author,
    // Die Hauptkategorie zuerst, danach die weiteren – ohne Dubletten.
    categories: [p.category, ...p.categories].filter(
      (c, i, all): c is string => !!c && all.indexOf(c) === i,
    ),
    sections: p.sections.map(toSectionView),
    event: p.eventDate ? toEventInfo(p, p.eventDate) : null,
  };
}

function toEventInfo(p: ApiPostDetail, date: string): EventInfo {
  const location = p.location ?? '';
  const street = p.street ?? '';
  const city = p.city ?? '';
  const address = [location, street, city].filter((part) => part !== '').join(', ');
  const registrationUrl = p.registrationUrl ?? '';

  return {
    date,
    dateLabel: formatDateWithWeekday(date),
    start: p.eventStart ?? '',
    end: p.eventEnd ?? '',
    time: formatTimeRange(p.eventStart, p.eventEnd),
    kicker: p.kicker ?? '',
    location,
    street,
    city,
    address,
    routeHref: directionsToAddress(address),
    prices: p.prices ?? [],
    registrationUrl,
    // Wie beim Link-Baustein: eine Adresse der eigenen Seite beginnt mit "/".
    registrationExternal: registrationUrl !== '' && !registrationUrl.startsWith('/'),
    // "Lehrpersonen, Schulleitungen" wird zu zwei Abzeichen.
    audience: (p.audience ?? '')
      .split(',')
      .map((group) => group.trim())
      .filter((group) => group !== ''),
    admission: p.admission ?? '',
    membersOnly: p.membersOnly ?? false,
  };
}

export function toEventCard(e: ApiEvent): EventCard {
  const [year = '', month = '', day = ''] = e.eventDate.split('-');
  return {
    slug: e.slug,
    title: e.title,
    excerpt: e.excerpt,
    cat: e.category ?? '',
    date: e.eventDate,
    dateLabel: formatDateWithWeekday(e.eventDate),
    // "04" sieht auf dem Datumsblatt wie ein Formular aus; "4" wie ein Datum.
    day: String(Number(day) || day),
    month: MONTHS_DE_SHORT[Number(month) - 1] ?? month,
    year,
    time: formatTimeRange(e.eventStart, e.eventEnd),
    location: e.location,
    kicker: e.kicker ?? '',
    membersOnly: e.membersOnly ?? false,
    cover: toViewImage(e.cover, e.title),
  };
}
