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
  category: string | null;
  categorySlug: string | null;
  readMinutes: number | null;
  cover: ApiImage | null;
}

export interface ApiPostDetail extends ApiPost {
  author: string | null;
  categories: string[];
  sections: { text: string; images: ApiImage[] }[];
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
  documents: { label: string; href: string; mime: string; bytes: number | null }[];
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

  categories(): Observable<ApiCategory[]> {
    return this.unwrap<ApiCategory[]>(`${API}/categories`);
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
