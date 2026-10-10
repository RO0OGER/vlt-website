import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

/**
 * Zugriff auf die Lese-API unter /api/.
 *
 * Die API liegt auf derselben Domain wie die Seite, deshalb genuegt der
 * relative Pfad – kein CORS, keine Adresse im Code, die sich beim Umzug
 * aendern muesste. Beim `ng serve` leitet proxy.conf.json /api an den
 * Server weiter, damit die Entwicklung ohne lokales PHP auskommt.
 *
 * Der Service ist die einzige Stelle, die das Format der API kennt. Die
 * Komponenten bekommen die Modelle, die sie ohnehin verwenden (BlogPost,
 * GalleryAlbum …). Aendert die API ihr Format, wird nur hier angepasst.
 */

const API = '/api';

/** Bild, wie die API es liefert. */
export interface ApiImage {
  src: string;
  alt: string;
  /** Hoehe/Breite. Null, wenn die Masse nicht gepflegt sind. */
  ratio: number | null;
}

export interface ApiPost {
  id: number;
  slug: string;
  title: string;
  excerpt: string;
  /** ISO-Datum (YYYY-MM-DD). */
  date: string;
  /** Hauptkategorie – sie steht auf der Karte. */
  category: string | null;
  categorySlug: string | null;
  /**
   * Alle Kategorien des Beitrags, Hauptkategorie zuerst. Die Uebersicht
   * filtert danach: ein Beitrag gehoert oft zu mehreren, und nach jeder
   * davon soll er sich finden lassen.
   */
  categories: string[];
  cover: ApiImage | null;
}

/** Art eines Abschnitts. Beitraege aus der Migration sind durchgehend 'text'. */
export type ApiSectionKind =
  | 'text'
  | 'heading'
  | 'quote'
  | 'image'
  | 'gallery'
  | 'table'
  | 'document'
  | 'link'
  | 'map';

/** Standort eines Karten-Abschnitts. */
export interface ApiLocation {
  lat: number;
  lng: number;
  zoom: number;
}

/**
 * Eine Datei zum Herunterladen. Gleich geformt fuer die Dokumente einer
 * Seite und die eines Dokument-Abschnitts – im Frontend ist beides dieselbe
 * Download-Zeile.
 */
export interface ApiDocument {
  /** Linktext. */
  label: string;
  /** Adresse der Datei. */
  href: string;
  mime: string;
  bytes: number | null;
}

/** Die Tabelle eines Tabellen-Abschnitts. Alle Zeilen sind gleich lang. */
export interface ApiTable {
  /** Erste Zeile ist die Kopfzeile. */
  head: boolean;
  rows: string[][];
}

/**
 * Ein Abschnitt der Detailseite.
 *
 * Text und Bilder traegt jede Art; `url`, `table`, `documents` und
 * `location` sind nur bei der Art gefuellt, zu der sie gehoeren. Beitraege,
 * die vor den neuen Arten gespeichert wurden, haben dort null
 * beziehungsweise eine leere Liste.
 */
export interface ApiSection {
  kind: ApiSectionKind;
  text: string;
  images: ApiImage[];
  /** Ziel des Link-Abschnitts. */
  url: string | null;
  table: ApiTable | null;
  documents: ApiDocument[];
  /** Standort des Karten-Abschnitts. Fehlt bei Antworten von vor Migration 006. */
  location?: ApiLocation | null;
}

/** Eine Preisstufe eines Events, z. B. "Mitglieder" – "gratis". */
export interface ApiPrice {
  label: string;
  value: string;
}

/**
 * Die Angaben eines Verbandsanlasses – dieselben Felder, die er frueher bei
 * guidle hatte, ohne den Plan. Bei Beitraegen leer.
 */
export interface ApiEventFields {
  /** Beginn als "HH:MM". Null: ganztags oder noch offen. */
  eventStart: string | null;
  eventEnd: string | null;
  /** Name des Orts, z. B. "Kantonsschule Zug". */
  location: string | null;
  /** Untertitel ueber dem Titel, z. B. "Workshop / Weiterbildung". */
  kicker: string | null;
  street: string | null;
  /** PLZ und Ort, z. B. "6300 Zug". */
  city: string | null;
  prices: ApiPrice[];
  /** Ziel des Anmeldeknopfs. */
  registrationUrl: string | null;
  /** Zielgruppe, durch Komma getrennt. */
  audience: string | null;
  /** Zutrittskonditionen in einem Satz. */
  admission: string | null;
  membersOnly: boolean;
}

/**
 * Beitrag oder Event mit allen Abschnitten. Bei Beitraegen sind die
 * Event-Felder leer. Optional, weil eine Antwort von vor Migration 008 sie
 * nicht kennt.
 */
export interface ApiPostDetail extends ApiPost, Partial<ApiEventFields> {
  author: string | null;
  categories: string[];
  sections: ApiSection[];
  eventDate?: string | null;
}

/** Ein Event in der Uebersicht. */
export interface ApiEvent {
  id: number;
  slug: string;
  title: string;
  excerpt: string;
  /** ISO-Datum (YYYY-MM-DD) des Events. */
  eventDate: string;
  eventStart: string | null;
  eventEnd: string | null;
  location: string;
  kicker: string | null;
  city: string | null;
  membersOnly: boolean;
  category: string | null;
  cover: ApiImage | null;
}

/** Was die Startseite ausser Beitraegen und Events braucht. */
export interface ApiHome {
  /** Das grosse Bild neben dem Titel. Null: Platzhalterflaeche. */
  heroImage: ApiImage | null;
}

export interface ApiCategory {
  id: number;
  slug: string;
  name: string;
  postCount: number;
}

export interface ApiAlbum {
  id: number;
  slug: string;
  title: string;
  excerpt: string;
  date: string;
  location: string | null;
  category: string | null;
  imageCount: number;
  cover: ApiImage | null;
}

export interface ApiAlbumDetail extends Omit<ApiAlbum, 'imageCount' | 'cover'> {
  images: ApiImage[];
}

export interface ApiPage {
  slug: string;
  title: string;
  /** Bereits bereinigtes HTML aus der Datenbank. */
  body: string;
  updatedAt: string;
  documents: ApiDocument[];
}

export interface ApiBoardMember {
  id: number;
  name: string;
  role: string | null;
  ikaFunction: string;
  school: { name: string; url: string | null };
  email: string | null;
  photo: ApiImage | null;
}

export interface ApiLinkGroup {
  name: string;
  links: { title: string; url: string | null; description: string | null }[];
}

/** Seitenweise Antwort der Beitragsuebersicht. */
export interface Paged<T> {
  items: T[];
  page: number;
  perPage: number;
  total: number;
  pages: number;
}

/** Huelle, in die die API jede Antwort packt. */
interface Envelope<T> {
  data: T;
  meta?: { page: number; perPage: number; total: number; pages: number };
}

@Injectable({ providedIn: 'root' })
export class ContentApi {
  private readonly http = inject(HttpClient);

  /** Beitraege, neuste zuerst. Ohne Kategorie kommen alle. */
  posts(options: { page?: number; perPage?: number; category?: string } = {}): Observable<Paged<ApiPost>> {
    let params = new HttpParams();
    if (options.page) params = params.set('page', options.page);
    if (options.perPage) params = params.set('per_page', options.perPage);
    if (options.category) params = params.set('category', options.category);

    return this.http.get<Envelope<ApiPost[]>>(`${API}/posts`, { params }).pipe(
      map((res) => ({
        items: res.data,
        page: res.meta?.page ?? 1,
        perPage: res.meta?.perPage ?? res.data.length,
        total: res.meta?.total ?? res.data.length,
        pages: res.meta?.pages ?? 1,
      })),
    );
  }

  post(slug: string): Observable<ApiPostDetail> {
    return this.unwrap<ApiPostDetail>(`${API}/posts/${encodeURIComponent(slug)}`);
  }

  /** Alle veroeffentlichten Events, das frueheste zuerst. */
  events(): Observable<ApiEvent[]> {
    return this.unwrap<ApiEvent[]>(`${API}/events`);
  }

  /** Ein Event – gleich aufgebaut wie ein Beitrag, dazu Datum und Ort. */
  event(slug: string): Observable<ApiPostDetail> {
    return this.unwrap<ApiPostDetail>(`${API}/events/${encodeURIComponent(slug)}`);
  }

  categories(): Observable<ApiCategory[]> {
    return this.unwrap<ApiCategory[]>(`${API}/categories`);
  }

  /** Titelbild und weitere Angaben der Startseite, im CMS gepflegt. */
  home(): Observable<ApiHome> {
    return this.unwrap<ApiHome>(`${API}/home`);
  }

  page(slug: string): Observable<ApiPage> {
    return this.unwrap<ApiPage>(`${API}/pages/${encodeURIComponent(slug)}`);
  }

  albums(): Observable<ApiAlbum[]> {
    return this.unwrap<ApiAlbum[]>(`${API}/albums`);
  }

  album(slug: string): Observable<ApiAlbumDetail> {
    return this.unwrap<ApiAlbumDetail>(`${API}/albums/${encodeURIComponent(slug)}`);
  }

  board(): Observable<ApiBoardMember[]> {
    return this.unwrap<ApiBoardMember[]>(`${API}/board`);
  }

  links(): Observable<ApiLinkGroup[]> {
    return this.unwrap<ApiLinkGroup[]>(`${API}/links`);
  }

  /** Holt die Huelle weg, damit die Komponenten nur die Daten sehen. */
  private unwrap<T>(url: string): Observable<T> {
    return this.http.get<Envelope<T>>(url).pipe(map((res) => res.data));
  }
}

/** Formatiert die Lesedauer so, wie die Karten sie anzeigen ("6 min"). */
export function formatReadTime(minutes: number | null): string {
  return minutes ? `${minutes} min` : '';
}
