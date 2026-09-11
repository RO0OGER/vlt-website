import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Title } from '@angular/platform-browser';
import { ActivatedRoute, Router } from '@angular/router';

import {
  AdminAlbumDetail,
  AdminApi,
  AdminCategory,
  AdminMedia,
  AlbumPayload,
  apiErrorText,
} from '../../../../shared/admin-api';
import { slugify } from '../../../../shared/blocks';
import { MediaPicker } from '../../../../shared/media-picker/media-picker';

/** Wofuer die Bildauswahl gerade offen ist. */
type PickerTarget = 'cover' | 'images';

/**
 * Editor einer Bildergalerie.
 *
 * Ein Album sind Kopfdaten und eine geordnete Reihe von Bildern. Die
 * Reihenfolge zaehlt: die Lightbox blaettert genau in ihr. Bilder lassen
 * sich darum ziehen, und fuer die Tastatur gibt es an jeder Kachel Pfeile –
 * dieselbe Regel wie im Beitragseditor, jede Zieh-Geste hat eine
 * Entsprechung zum Anklicken.
 *
 * Die Bilder kommen aus demselben Bestand wie die der Beitraege. Ein Album
 * verweist nur darauf; dasselbe Bild kann in mehreren Alben liegen.
 */
@Component({
  selector: 'app-album-editor',
  standalone: true,
  imports: [FormsModule, MediaPicker],
  templateUrl: './album-editor.html',
  styleUrl: './album-editor.css',
})
export class AlbumEditor {
  private readonly api = inject(AdminApi);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly titleService = inject(Title);

  readonly albumId = signal<number | null>(null);
  readonly images = signal<AdminMedia[]>([]);
  readonly categories = signal<AdminCategory[]>([]);
  readonly cover = signal<AdminMedia | null>(null);

  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly error = signal('');
  readonly notice = signal('');
  readonly dirty = signal(false);

  // ── Kopfdaten ──────────────────────────────────────────────
  title = '';
  excerpt = '';
  date = todayIso();
  location = '';
  categoryId: number | null = null;

  readonly status = signal<'draft' | 'published'>('draft');
  readonly slug = signal('');
  readonly slugPreview = signal('');

  /**
   * Bild, auf dessen Vorschau die Maus gerade gedrueckt ist.
   *
   * Nur dieses darf gezogen werden. Laege draggable fest auf der ganzen
   * Kachel, wuerde der Browser schon beim Druck auf einen der Knoepfe
   * darunter einen Zug beginnen – der Klick kaeme nie an, und die Pfeile
   * waeren wirkungslos.
   */
  readonly armed = signal<number | null>(null);
  /** Bild, das gerade gezogen wird. */
  readonly dragId = signal<number | null>(null);
  /** Stelle, an der beim Loslassen eingefuegt wird. */
  readonly dropIndex = signal<number | null>(null);

  readonly picker = signal<PickerTarget | null>(null);

  readonly isNew = computed(() => this.albumId() === null);

  /**
   * Bilder, die dieses Album belegt – die Bildauswahl sperrt sie fuers
   * Loeschen, auch solange sie noch nicht gespeichert sind.
   */
  readonly usedImageIds = computed(() => {
    const ids = this.images().map((image) => image.id);
    const coverId = this.cover()?.id;
    return coverId === undefined ? ids : [...ids, coverId];
  });

  /**
   * Welches Bild wird auf der Karte erscheinen?
   *
   * Ohne gewaehltes Titelbild nimmt die API das erste – hier wird dasselbe
   * angezeigt, damit im Editor steht, was nachher draussen zu sehen ist.
   */
  /*
   * Der Rueckgabetyp steht ausdruecklich da: ohne ihn haelt TypeScript
   * images()[0] fuer immer belegt (noUncheckedIndexedAccess ist aus) und
   * leitet "nie null" ab. Bei einem Album ohne Bilder waere das falsch.
   */
  readonly effectiveCover = computed<AdminMedia | null>(
    () => this.cover() ?? this.images()[0] ?? null,
  );

  constructor() {
    const param = this.route.snapshot.paramMap.get('id');
    const id = param !== null && param !== 'neu' && /^\d+$/.test(param) ? Number(param) : null;

    this.api.categories().subscribe({
      next: (categories) => this.categories.set(categories),
      error: () => this.categories.set([]),
    });

    if (id === null) {
      this.titleService.setTitle('Neues Album – VLT Admin');
      this.loading.set(false);
      return;
    }

    this.albumId.set(id);
    this.api.album(id).subscribe({
      next: (album) => {
        this.fill(album);
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set(apiErrorText(err, 'Das Album liess sich nicht laden.'));
        this.loading.set(false);
      },
    });
  }

  private fill(album: AdminAlbumDetail): void {
    this.title = album.title;
    this.excerpt = album.excerpt;
    this.date = album.date;
    this.location = album.location ?? '';
    this.categoryId = album.categoryId;
    this.status.set(album.status);
    this.slug.set(album.slug);
    this.slugPreview.set(album.slug);

    this.images.set(album.images);
    this.cover.set(album.cover);

    this.titleService.setTitle(`${album.title} – VLT Admin`);
    this.dirty.set(false);
  }

  // ── Kopfdaten ──────────────────────────────────────────────

  touch(): void {
    this.dirty.set(true);
    this.notice.set('');
  }

  /** Die Adresse zieht mit dem Titel mit; den endgueltigen Wert vergibt die API. */
  onTitleChange(value: string): void {
    this.touch();
    this.slugPreview.set(slugify(value));
  }

  setStatus(status: 'draft' | 'published'): void {
    this.status.set(status);
    this.touch();
  }

  // ── Bilder ─────────────────────────────────────────────────

  openImagePicker(): void {
    this.picker.set('images');
  }

  openCoverPicker(): void {
    this.picker.set('cover');
  }

  closePicker(): void {
    this.picker.set(null);
  }

  onImageChosen(image: AdminMedia): void {
    const target = this.picker();
    this.picker.set(null);
    if (!target) return;

    if (target === 'cover') {
      this.cover.set(image);
      this.touch();
      return;
    }

    /*
     * Dasselbe Bild nicht zweimal: album_images fuehrt ein Bild je Album nur
     * einmal. Die API wuerde die Dublette stillschweigend verwerfen – dann
     * verschwaende die eben gewaehlte Kachel beim Speichern wieder.
     */
    if (this.images().some((entry) => entry.id === image.id)) {
      this.notice.set('Dieses Bild ist im Album schon enthalten.');
      return;
    }

    this.images.update((list) => [...list, image]);
    this.touch();
  }

  removeImage(id: number): void {
    this.images.update((list) => list.filter((image) => image.id !== id));
    // War es das Titelbild, faellt das Album auf sein erstes Bild zurueck.
    if (this.cover()?.id === id) this.cover.set(null);
    this.touch();
  }

  clearCover(): void {
    this.cover.set(null);
    this.touch();
  }

  /** Verschiebt ein Bild um eine Stelle – gleichwertig zum Ziehen. */
  move(id: number, direction: -1 | 1): void {
    this.images.update((list) => {
      const from = list.findIndex((image) => image.id === id);
      const to = from + direction;
      if (from < 0 || to < 0 || to >= list.length) return list;

      const next = [...list];
      [next[from], next[to]] = [next[to], next[from]];
      return next;
    });
    this.touch();
  }

  // ── Ziehen und Ablegen ─────────────────────────────────────

  startDrag(id: number, event: DragEvent): void {
    // Gezogen wird nur, was am Bild aufgenommen wurde.
    if (this.armed() !== id) {
      event.preventDefault();
      return;
    }
    this.dragId.set(id);
    // setData ist Pflicht: ohne Nutzlast bricht Firefox den Zug sofort ab.
    event.dataTransfer?.setData('text/plain', String(id));
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
  }

  /**
   * Ueber einer Kachel. Die Haelfte, in der der Zeiger steht, entscheidet:
   * linke Haelfte heisst davor einfuegen, rechte dahinter. So ist jede
   * Kachel auf ihrer ganzen Breite ein Ziel – schmale Streifen dazwischen
   * waeren kaum zu treffen.
   */
  overTile(index: number, event: DragEvent): void {
    if (this.dragId() === null) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';

    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const hintenRein = event.clientX > rect.left + rect.width / 2;
    this.dropIndex.set(hintenRein ? index + 1 : index);
  }

  dropOnTile(event: DragEvent): void {
    event.preventDefault();
    const id = this.dragId();
    const index = this.dropIndex();
    this.endDrag();
    if (id === null || index === null) return;

    this.images.update((list) => {
      const from = list.findIndex((image) => image.id === id);
      if (from < 0) return list;

      const next = [...list];
      const [moved] = next.splice(from, 1);
      // Nach dem Herausnehmen rutscht alles dahinter eine Stelle vor – die
      // Zielstelle muss mitrutschen, sonst landet das Bild daneben.
      next.splice(index > from ? index - 1 : index, 0, moved);
      return next;
    });
    this.touch();
  }

  endDrag(): void {
    this.armed.set(null);
    this.dragId.set(null);
    this.dropIndex.set(null);
  }

  // ── Speichern ──────────────────────────────────────────────

  save(status?: 'draft' | 'published'): void {
    if (this.saving()) return;
    if (status) this.status.set(status);

    this.error.set('');
    this.notice.set('');

    if (this.title.trim() === '') {
      this.error.set('Ohne Titel geht es nicht.');
      return;
    }

    const payload: AlbumPayload = {
      title: this.title.trim(),
      excerpt: this.excerpt.trim(),
      date: this.date,
      location: this.location.trim(),
      status: this.status(),
      categoryId: this.categoryId,
      coverId: this.cover()?.id ?? null,
      imageIds: this.images().map((image) => image.id),
    };

    this.saving.set(true);
    const id = this.albumId();
    const request = id === null ? this.api.createAlbum(payload) : this.api.updateAlbum(id, payload);

    request.subscribe({
      next: (result) => {
        this.saving.set(false);
        this.dirty.set(false);
        this.slug.set(result.slug);
        this.slugPreview.set(result.slug);
        this.notice.set(
          this.status() === 'published' ? 'Gespeichert und veröffentlicht.' : 'Als Entwurf gespeichert.',
        );

        if (id === null) {
          this.albumId.set(result.id);
          this.router.navigate(['/admin/galerie', result.id], { replaceUrl: true });
        }
      },
      error: (err) => {
        this.saving.set(false);
        this.error.set(apiErrorText(err, 'Das Album liess sich nicht speichern.'));
      },
    });
  }

  back(): void {
    if (this.dirty() && !confirm('Es gibt ungespeicherte Änderungen. Trotzdem zurück?')) {
      return;
    }
    this.router.navigate(['/admin/galerie']);
  }
}

/** Heutiges Datum als JJJJ-MM-TT – das Format, das die API erwartet. */
function todayIso(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}
