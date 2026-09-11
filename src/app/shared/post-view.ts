import { ApiImage, ApiPost, ApiPostDetail, ApiSectionKind } from './content-api';
import { formatDateLong } from './dates';

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

/**
 * Ein Abschnitt, wie die Detailseite ihn darstellt.
 *
 * Die Art entscheidet ueber die Darstellung: Fliesstext, Zwischentitel,
 * Zitat oder Bild. Sie kommt aus dem Block-Editor im CMS. Beitraege aus der
 * WordPress-Migration haben keine Art gepflegt und sind darum Fliesstext –
 * genau das, was sie vorher auch waren.
 */
export interface SectionView {
  kind: ApiSectionKind;
  text: string;
  images: ViewImage[];
}

export interface PostView extends PostCard {
  author: string | null;
  categories: string[];
  sections: SectionView[];
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

export function toPostView(p: ApiPostDetail): PostView {
  return {
    ...toPostCard(p),
    author: p.author,
    // Die Hauptkategorie zuerst, danach die weiteren – ohne Dubletten.
    categories: [p.category, ...p.categories].filter(
      (c, i, all): c is string => !!c && all.indexOf(c) === i,
    ),
    sections: p.sections.map((s) => ({
      // Aeltere Antworten ohne kind gelten als Fliesstext.
      kind: s.kind ?? 'text',
      text: s.text,
      images: s.images.map((img) => toViewImage(img)),
    })),
  };
}
