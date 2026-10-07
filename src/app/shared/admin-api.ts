import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

import { AuthService } from './auth.service';
import { BlockKind, MapLocation, PayloadBlock, TableData } from './blocks';

/**
 * Zugriff auf die Schreib-API des CMS unter /api/admin/.
 *
 * Getrennt von ContentApi, und das mit Absicht: ContentApi bedient die
 * oeffentliche Seite und kommt ohne Anmeldung aus. Hier traegt jede Anfrage
 * das Token aus der Anmeldung, und jede Antwort kann auch Entwuerfe
 * enthalten. Wer die beiden vermischt, laedt sich irgendwann einen Entwurf
 * auf die oeffentliche Seite.
 */

const API = '/api/admin';

/** Huelle, in die die API jede Antwort packt. */
interface Envelope<T> {
  data: T;
}

/**
 * Die beiden Bestaende, zwischen denen die Dateiauswahl unterscheidet.
 *
 * Dieselbe Tabelle, dieselbe Ablage – getrennt nur in der Ansicht: in einen
 * Bildbaustein gehoert kein PDF, und in eine Download-Liste kein Foto.
 */
export type MediaKind = 'image' | 'document';

/**
 * Beitrag oder Event. Beide liegen in derselben Tabelle und bestehen aus
 * denselben Bausteinen; die API trennt sie ueber die Adresse
 * (/api/admin/posts und /api/admin/events).
 */
export type PostType = 'post' | 'event';

/** Adresse der Schreib-API je Typ. */
const RESOURCE: Record<PostType, string> = {
  post: `${API}/posts`,
  event: `${API}/events`,
};

/** Datei aus dem Bestand, wie die Dateiauswahl sie braucht. */
export interface AdminMedia {
  id: number;
  src: string;
  alt: string;
  /** Hoehe/Breite. Null, wenn die Masse nicht gepflegt sind. */
  ratio: number | null;
  path: string;
  mime: string;
  width: number | null;
  height: number | null;
  bytes: number | null;
}

/** Ein Beitrag oder Event in der Uebersicht. */
export interface AdminPostRow {
  id: number;
  slug: string;
  title: string;
  excerpt: string;
  date: string;
  /** Nur bei Events gesetzt. */
  eventDate: string | null;
  eventTime: string | null;
  location: string | null;
  status: 'draft' | 'published';
  updatedAt: string;
  categoryId: number | null;
  category: string | null;
  blockCount: number;
  cover: { src: string; alt: string; ratio: number | null } | null;
}

/** Eine Datei in einem Dokument-Baustein, wie die API sie liefert. */
export interface AdminBlockDocument {
  /** Linktext im Beitrag. Gehoert zum Baustein, nicht zur Datei. */
  label: string;
  file: AdminMedia;
}

/**
 * Ein Block, wie die API ihn liefert.
 *
 * `url`, `table`, `documents` und `location` stehen bei jedem Block,
 * gefuellt sind sie nur bei der Art, zu der sie gehoeren – siehe
 * BlockPayload in blocks.ts.
 */
export interface AdminBlock {
  kind: BlockKind;
  text: string;
  images: AdminMedia[];
  url: string | null;
  table: TableData | null;
  documents: AdminBlockDocument[];
  location: MapLocation | null;
}

/** Ein Beitrag oder Event mit allem, was der Editor braucht. */
export interface AdminPostDetail {
  id: number;
  slug: string;
  title: string;
  excerpt: string;
  date: string;
  /** Tag des Events; bei Beitraegen null. */
  eventDate: string | null;
  /** Zeit als freier Text, z. B. "17.30 – 21.00 Uhr". */
  eventTime: string | null;
  /** Ort in einer Zeile; bei Beitraegen null. */
  location: string | null;
  author: string | null;
  readMinutes: number | null;
  status: 'draft' | 'published';
  categoryId: number | null;
  categoryIds: number[];
  coverId: number | null;
  /** Vollstaendiger Medieneintrag, damit der Editor ihn wie jedes andere
   *  Bild behandeln kann. */
  cover: AdminMedia | null;
  updatedAt: string;
  blocks: AdminBlock[];
}

/**
 * Was der Editor beim Speichern schickt.
 *
 * Ohne `slug`: die Adresse leitet die API aus dem Titel ab und vergibt sie
 * zurueck. Sie liesse sich hier zwar mitschicken, aber dann gaebe es zwei
 * Stellen, die dieselbe Regel kennen – und irgendwann waeren sie sich
 * uneinig.
 */
export interface PostPayload {
  title: string;
  excerpt: string;
  /** Veroeffentlichungsdatum. Bei Events liest die API es nicht. */
  date: string;
  /** Nur bei Events: Datum (Pflicht), Zeit, Ort (Pflicht). */
  eventDate: string;
  eventTime: string;
  location: string;
  author: string;
  readMinutes: number | null;
  status: 'draft' | 'published';
  categoryId: number | null;
  categoryIds: number[];
  coverId: number | null;
  blocks: PayloadBlock[];
}

/** Ein Album in der Uebersicht. */
export interface AdminAlbumRow {
  id: number;
  slug: string;
  title: string;
  excerpt: string;
  date: string;
  location: string | null;
  status: 'draft' | 'published';
  category: string | null;
  imageCount: number;
  cover: { src: string; alt: string; ratio: number | null } | null;
}

/** Ein Album mit allem, was der Editor braucht. */
export interface AdminAlbumDetail {
  id: number;
  slug: string;
  title: string;
  excerpt: string;
  date: string;
  location: string | null;
  categoryId: number | null;
  coverId: number | null;
  cover: AdminMedia | null;
  status: 'draft' | 'published';
  images: AdminMedia[];
}

/** Was der Album-Editor beim Speichern schickt. */
export interface AlbumPayload {
  title: string;
  excerpt: string;
  date: string;
  location: string;
  status: 'draft' | 'published';
  categoryId: number | null;
  /** Null heisst: das erste Bild wird Titelbild. */
  coverId: number | null;
  imageIds: number[];
}

export interface AdminCategory {
  id: number;
  slug: string;
  name: string;
  /** Reihenfolge in der Filterleiste; bei gleichem Wert alphabetisch. */
  sort?: number;
  /** Beitraege mit dieser Kategorie – Haupt- und Nebenzuordnung zusammen. */
  postCount?: number;
  albumCount?: number;
  /** Wird die Kategorie irgendwo verwendet? Dann bleibt sie. */
  inUse?: boolean;
}

/** Ein Zugang zum CMS. */
export interface AdminUser {
  id: number;
  email: string;
  createdAt: string;
  /** Es gilt noch das verteilte Startpasswort. */
  mustChangePassword: boolean;
  /** Der geschuetzte Zugang – er laesst sich nicht loeschen. */
  protected: boolean;
  /** Der gerade angemeldete Zugang. */
  self: boolean;
}

/**
 * Antwort auf einen neu angelegten Zugang.
 *
 * `password` ist das einzige Mal, dass dieses Passwort im Klartext zu sehen
 * ist – gespeichert wird nur sein Hash.
 */
export interface NewUser {
  id: number;
  email: string;
  password: string;
}

@Injectable({ providedIn: 'root' })
export class AdminApi {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);

  /**
   * Eigener Header statt Authorization – denselben Grund wie im AuthService:
   * laeuft PHP als CGI, reicht Apache den Authorization-Header nicht durch.
   */
  private headers(): HttpHeaders {
    return new HttpHeaders({ 'X-Auth-Token': this.auth.getToken() ?? '' });
  }

  /** Alle Beitraege oder Events, Entwuerfe eingeschlossen. */
  posts(type: PostType = 'post'): Observable<AdminPostRow[]> {
    return this.unwrap<AdminPostRow[]>(this.http.get<Envelope<AdminPostRow[]>>(RESOURCE[type], {
      headers: this.headers(),
    }));
  }

  post(id: number, type: PostType = 'post'): Observable<AdminPostDetail> {
    return this.unwrap<AdminPostDetail>(
      this.http.get<Envelope<AdminPostDetail>>(`${RESOURCE[type]}/${id}`, { headers: this.headers() }),
    );
  }

  create(payload: PostPayload, type: PostType = 'post'): Observable<{ id: number; slug: string }> {
    return this.unwrap(
      this.http.post<Envelope<{ id: number; slug: string }>>(RESOURCE[type], payload, {
        headers: this.headers(),
      }),
    );
  }

  update(id: number, payload: PostPayload, type: PostType = 'post'): Observable<{ id: number; slug: string }> {
    return this.unwrap(
      this.http.put<Envelope<{ id: number; slug: string }>>(`${RESOURCE[type]}/${id}`, payload, {
        headers: this.headers(),
      }),
    );
  }

  remove(id: number, type: PostType = 'post'): Observable<unknown> {
    return this.http.delete(`${RESOURCE[type]}/${id}`, { headers: this.headers() });
  }

  categories(): Observable<AdminCategory[]> {
    return this.unwrap<AdminCategory[]>(
      this.http.get<Envelope<AdminCategory[]>>(`${API}/categories`, { headers: this.headers() }),
    );
  }

  /** Der Bestand fuer die Dateiauswahl, neuste zuerst. */
  media(kind: MediaKind = 'image', limit = 200): Observable<AdminMedia[]> {
    const params = new HttpParams().set('limit', limit).set('kind', kind);
    return this.unwrap<AdminMedia[]>(
      this.http.get<Envelope<AdminMedia[]>>(`${API}/media`, { headers: this.headers(), params }),
    );
  }

  /** Alle Alben, Entwuerfe eingeschlossen. */
  albums(): Observable<AdminAlbumRow[]> {
    return this.unwrap<AdminAlbumRow[]>(
      this.http.get<Envelope<AdminAlbumRow[]>>(`${API}/albums`, { headers: this.headers() }),
    );
  }

  album(id: number): Observable<AdminAlbumDetail> {
    return this.unwrap<AdminAlbumDetail>(
      this.http.get<Envelope<AdminAlbumDetail>>(`${API}/albums/${id}`, { headers: this.headers() }),
    );
  }

  createAlbum(payload: AlbumPayload): Observable<{ id: number; slug: string }> {
    return this.unwrap(
      this.http.post<Envelope<{ id: number; slug: string }>>(`${API}/albums`, payload, {
        headers: this.headers(),
      }),
    );
  }

  updateAlbum(id: number, payload: AlbumPayload): Observable<{ id: number; slug: string }> {
    return this.unwrap(
      this.http.put<Envelope<{ id: number; slug: string }>>(`${API}/albums/${id}`, payload, {
        headers: this.headers(),
      }),
    );
  }

  removeAlbum(id: number): Observable<unknown> {
    return this.http.delete(`${API}/albums/${id}`, { headers: this.headers() });
  }

  /** Legt eine Kategorie an. Die Adresse entsteht aus dem Namen. */
  createCategory(name: string): Observable<AdminCategory> {
    return this.unwrap<AdminCategory>(
      this.http.post<Envelope<AdminCategory>>(
        `${API}/categories`,
        { name },
        { headers: this.headers() },
      ),
    );
  }

  /** Entfernt eine Kategorie. Die API lehnt mit 409 ab, wenn sie benutzt wird. */
  removeCategory(id: number): Observable<unknown> {
    return this.http.delete(`${API}/categories/${id}`, { headers: this.headers() });
  }

  /** Alle Zugaenge zum CMS. */
  users(): Observable<AdminUser[]> {
    return this.unwrap<AdminUser[]>(
      this.http.get<Envelope<AdminUser[]>>(`${API}/users`, { headers: this.headers() }),
    );
  }

  /** Legt einen Zugang an. Das Startpasswort kommt genau einmal zurueck. */
  createUser(email: string): Observable<NewUser> {
    return this.unwrap<NewUser>(
      this.http.post<Envelope<NewUser>>(`${API}/users`, { email }, { headers: this.headers() }),
    );
  }

  removeUser(id: number): Observable<unknown> {
    return this.http.delete(`${API}/users/${id}`, { headers: this.headers() });
  }

  /**
   * Entfernt eine Datei aus dem Bestand.
   *
   * Die API lehnt mit 409 ab, wenn die Datei noch irgendwo verwendet wird.
   * Welche Stellen das sind, steht dann in `usedBy` – siehe mediaUsedBy().
   */
  removeMedia(id: number): Observable<unknown> {
    return this.http.delete(`${API}/media/${id}`, { headers: this.headers() });
  }

  /**
   * Laedt eine Datei hoch. FormData statt JSON, weil die Datei sonst als
   * Base64 durch die Leitung ginge – ein Drittel mehr Daten und doppelt so
   * viel Arbeit auf beiden Seiten.
   *
   * `kind` sagt der API, welche Typen sie annehmen soll. Sie koennte das aus
   * der Datei schliessen, aber dann waere die Fehlermeldung bei einer
   * abgewiesenen Datei eine Liste aller denkbaren Typen statt derjenigen,
   * die an dieser Stelle gemeint sind.
   */
  upload(file: File, alt: string, kind: MediaKind = 'image'): Observable<AdminMedia> {
    const form = new FormData();
    form.append('file', file);
    form.append('alt', alt);
    form.append('kind', kind);
    // Der Dateiname liefert den lesbaren Teil des Ablagepfads.
    form.append('name', file.name.replace(/\.[^.]+$/, ''));

    return this.unwrap<AdminMedia>(
      this.http.post<Envelope<AdminMedia>>(`${API}/media`, form, { headers: this.headers() }),
    );
  }

  private unwrap<T>(request: Observable<Envelope<T>>): Observable<T> {
    return request.pipe(map((res) => res.data));
  }
}

/**
 * Holt aus einem fehlgeschlagenen Aufruf die Meldung, die die API mitgibt.
 * Die ist auf Deutsch und benennt das Problem – besser als "Http failure
 * response for /api/admin/posts: 422".
 */
export function apiErrorText(error: unknown, fallback = 'Das hat nicht geklappt.'): string {
  const message = (error as { error?: { error?: unknown } } | null)?.error?.error;
  return typeof message === 'string' && message !== '' ? message : fallback;
}

/**
 * Liest die Fundstellen aus einer abgelehnten Bildloeschung (409).
 *
 * Ohne diese Liste stuende da nur "wird noch verwendet" – und der Redaktor
 * muesste jeden Beitrag einzeln durchsehen, um das eine zu finden.
 */
export function mediaUsedBy(error: unknown): string[] {
  const usedBy = (error as { error?: { usedBy?: unknown } } | null)?.error?.usedBy;
  return Array.isArray(usedBy) ? usedBy.filter((entry): entry is string => typeof entry === 'string') : [];
}
