import { ApiImage, ApiPost, ApiPostDetail } from './content-api';
import { formatDateLong } from './dates';

/**
 * Umformung der API-Antworten in die Form, die die Templates erwarten.
 *
 * Die Vorlagen der Beitragsseiten sind auf feste Felder ausgelegt (cat, read,
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
  /** Hauptkategorie, ausgeschrieben. */
  cat: string;
  /** ISO-Datum, fuer das datetime-Attribut. */
  date: string;
  /** Ausgeschriebenes Datum fuer die Anzeige. */
  dateLabel: string;
  /** Lesedauer als fertiger Text, z. B. "6 min". */
  read: string;
  cover: ViewImage;
}

export interface PostView extends PostCard {
  author: string | null;
  categories: string[];
  sections: { text: string; images: ViewImage[] }[];
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
  return {
    slug: p.slug,
    title: p.title,
    excerpt: p.excerpt,
    cat: p.category ?? 'Ohne Kategorie',
    date: p.date,
    dateLabel: formatDateLong(p.date),
    read: p.readMinutes ? `${p.readMinutes} min` : '',
    cover: toViewImage(p.cover, p.title),
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
    sections: p.sections.map((s) => ({
      text: s.text,
      images: s.images.map((img) => toViewImage(img)),
    })),
  };
}
