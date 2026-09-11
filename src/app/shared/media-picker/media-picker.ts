import {
  AfterViewInit,
  Component,
  ElementRef,
  computed,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';

import { AdminApi, AdminMedia, apiErrorText, mediaUsedBy } from '../admin-api';

/**
 * Bildauswahl fuer den Block-Editor.
 *
 * Zeigt den vorhandenen Bestand und nimmt neue Bilder entgegen. Beides in
 * einem Fenster, weil es beim Schreiben eines Beitrags dieselbe Frage ist:
 * "welches Bild kommt hier hin" – manchmal liegt es schon da, manchmal noch
 * auf dem Schreibtisch.
 *
 * Die Komponente laedt selbst und gibt nur das gewaehlte Bild nach oben.
 * Der Editor muss dadurch nichts ueber den Bildbestand wissen.
 */
@Component({
  selector: 'app-media-picker',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './media-picker.html',
  styleUrl: './media-picker.css',
})
export class MediaPicker implements AfterViewInit {
  private readonly api = inject(AdminApi);

  /**
   * Bilder, die im gerade offenen Beitrag stecken.
   *
   * Die API prueft die Verwendung in der Datenbank – ein Bild, das eben
   * erst in einen noch ungespeicherten Baustein gesetzt wurde, gilt dort
   * zu Recht als frei. Loeschen liesse es sich also, und der Editor haette
   * danach ein totes Bild stehen. Darum sperrt die Auswahl diese Bilder
   * zusaetzlich selbst.
   */
  readonly usedIds = input<number[]>([]);

  /** Das gewaehlte Bild. */
  readonly chosen = output<AdminMedia>();
  /** Abbrechen, ohne etwas zu waehlen. */
  readonly closed = output<void>();

  private readonly fileInput = viewChild<ElementRef<HTMLInputElement>>('fileInput');
  private readonly panel = viewChild<ElementRef<HTMLElement>>('panel');

  readonly media = signal<AdminMedia[]>([]);
  readonly loading = signal(true);
  readonly uploading = signal(false);
  readonly error = signal('');

  /** Bild, dessen Loeschung gerade bestaetigt werden soll. */
  readonly pending = signal<AdminMedia | null>(null);
  /** Bild, das gerade geloescht wird. */
  readonly deleting = signal<number | null>(null);
  /** Fundstellen aus einer abgelehnten Loeschung. */
  readonly usedBy = signal<string[]>([]);

  /** Suchbegriff, wird gegen Bildtext und Pfad geprueft. */
  search = '';
  /** Bildtext des naechsten Uploads. */
  uploadAlt = '';

  private readonly term = signal('');

  readonly visible = computed(() => {
    const term = this.term().trim().toLowerCase();
    if (term === '') return this.media();
    return this.media().filter(
      (image) =>
        image.alt.toLowerCase().includes(term) || image.path.toLowerCase().includes(term),
    );
  });

  constructor() {
    this.load();
  }

  /**
   * Den Dialog selbst fokussieren, sobald er steht.
   *
   * Zwei Gruende: die Tastatur landet im Fenster statt hinter ihm auf der
   * Seite, und Escape kommt hier an, ohne dass man erst irgendwo hineinklickt.
   */
  ngAfterViewInit(): void {
    this.panel()?.nativeElement.focus();
  }

  private load(): void {
    this.loading.set(true);
    this.api.media().subscribe({
      next: (media) => {
        this.media.set(media);
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set(apiErrorText(err, 'Der Bildbestand liess sich nicht laden.'));
        this.loading.set(false);
      },
    });
  }

  /** Sucht, waehrend getippt wird – der Bestand liegt ohnehin schon im Browser. */
  onSearch(value: string): void {
    this.term.set(value);
  }

  choose(image: AdminMedia): void {
    this.chosen.emit(image);
  }

  close(): void {
    this.closed.emit();
  }

  /**
   * Escape schliesst das Fenster – so, wie man es von jedem Dialog erwartet.
   * Das Ereignis wird angehalten, damit es nicht zusaetzlich im Editor
   * dahinter landet.
   */
  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.stopPropagation();
      this.close();
    }
  }

  pickFile(): void {
    this.fileInput()?.nativeElement.click();
  }

  /**
   * Nimmt die gewaehlte Datei entgegen und laedt sie hoch. Das fertige Bild
   * wird gleich uebernommen: wer eben ein Bild ausgesucht hat, will es an
   * dieser Stelle haben und nicht noch einmal anklicken.
   */
  onFile(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    this.error.set('');
    this.uploading.set(true);

    this.api.upload(file, this.uploadAlt.trim()).subscribe({
      next: (image) => {
        this.uploading.set(false);
        this.uploadAlt = '';
        // Zuruecksetzen, sonst loest dieselbe Datei kein change-Ereignis
        // mehr aus und ein zweiter Versuch bliebe wirkungslos.
        input.value = '';
        this.media.update((list) => [image, ...list]);
        this.chosen.emit(image);
      },
      error: (err) => {
        this.uploading.set(false);
        input.value = '';
        this.error.set(apiErrorText(err, 'Das Bild liess sich nicht hochladen.'));
      },
    });
  }

  /** Bildmasse als "1600 × 900" – leer, wenn sie nicht gepflegt sind. */
  dimensions(image: AdminMedia): string {
    return image.width && image.height ? `${image.width} × ${image.height}` : '';
  }

  // ── Löschen ────────────────────────────────────────────────

  /** Steckt das Bild im gerade offenen Beitrag? Dann bleibt es hier. */
  inOpenPost(image: AdminMedia): boolean {
    return this.usedIds().includes(image.id);
  }

  askDelete(image: AdminMedia): void {
    this.error.set('');
    this.usedBy.set([]);
    this.pending.set(image);
  }

  cancelDelete(): void {
    this.pending.set(null);
  }

  confirmDelete(): void {
    const image = this.pending();
    if (!image || this.deleting() !== null) return;

    this.pending.set(null);
    this.deleting.set(image.id);
    this.error.set('');
    this.usedBy.set([]);

    this.api.removeMedia(image.id).subscribe({
      next: () => {
        this.deleting.set(null);
        this.media.update((list) => list.filter((entry) => entry.id !== image.id));
      },
      error: (err) => {
        this.deleting.set(null);
        // 409 heisst: das Bild haengt noch irgendwo. Die Fundstellen sind
        // die eigentliche Antwort – ohne sie muesste man raten.
        this.error.set(apiErrorText(err, 'Das Bild liess sich nicht löschen.'));
        this.usedBy.set(mediaUsedBy(err));
      },
    });
  }
}
