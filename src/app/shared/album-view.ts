import { ApiAlbum, ApiAlbumDetail } from './content-api';
import { formatDateLong } from './dates';
import { ViewImage, toViewImage } from './post-view';

/**
 * Umformung der Album-Antworten in die Form, die die Galerie erwartet.
 *
 * Dasselbe Muster wie post-view.ts fuer die Beitraege: die API liefert die
 * Angaben, die Templates brauchen feste Felder. Diese Datei ist die einzige
 * Stelle, an der beides zusammenkommt.
 *
 * Bis hierher lagen die Alben fest ausprogrammiert in galerie/gallery-data.ts
 * – sechs erfundene Anlaesse ohne ein einziges Bild. Die Endpunkte
 * /api/albums gab es zu dem Zeitpunkt schon, benutzt hat sie nur niemand.
 */

/** Ein Album, wie die Karte in der Galerie es zeigt. */
export interface AlbumCard {
  id: number;
  /** Teil der Adresse: /api/albums/<slug> holt die Bilder nach. */
  slug: string;
  title: string;
  excerpt: string;
  /** Kategorie, ausgeschrieben. */
  cat: string;
  location: string | null;
  /** ISO-Datum, fuer das datetime-Attribut. */
  date: string;
  /** Ausgeschriebenes Datum fuer die Anzeige. */
  dateLabel: string;
  /** Wie viele Bilder das Album enthaelt – steht auf der Karte. */
  imageCount: number;
  cover: ViewImage;
}

/** Ein geoeffnetes Album samt Bildern. */
export interface AlbumView extends AlbumCard {
  images: ViewImage[];
}

export function toAlbumCard(a: ApiAlbum): AlbumCard {
  return {
    id: a.id,
    slug: a.slug,
    title: a.title,
    excerpt: a.excerpt,
    cat: a.category ?? 'Ohne Kategorie',
    location: a.location,
    date: a.date,
    dateLabel: formatDateLong(a.date),
    imageCount: a.imageCount,
    cover: toViewImage(a.cover, a.title),
  };
}

/**
 * Fuegt einer bereits gezeigten Karte die nachgeladenen Bilder hinzu.
 *
 * Die Uebersicht laedt nur Karten – die Bilder kommen erst, wenn jemand ein
 * Album oeffnet. Bei Alben mit dutzenden Aufnahmen waere alles auf einmal zu
 * laden eine lange Wartezeit fuer etwas, das die meisten nie anschauen.
 */
export function toAlbumView(card: AlbumCard, detail: ApiAlbumDetail): AlbumView {
  return {
    ...card,
    images: detail.images.map((img) => toViewImage(img)),
  };
}
