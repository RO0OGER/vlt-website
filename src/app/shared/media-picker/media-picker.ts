import {
  AfterViewInit,
  Component,
  ElementRef,
  OnInit,
  computed,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';

import { AdminApi, AdminMedia, MediaKind, apiErrorText, mediaUsedBy } from '../admin-api';

/** Was die Auswahl in ihrer jeweiligen Betriebsart beschriftet und annimmt. */
const WORDING: Record<MediaKind, {
  title: string;
  sub: string;
  search: string;
  describe: string;
  upload: string;
  uploading: string;
  accept: string;
  empty: string;
  nothingFound: string;
  loading: string;
}> = {
  image: {
    title: 'Bild wählen',
    sub: 'Aus dem Bestand oder neu hochladen.',
    search: 'Suchen nach Bildtext oder Dateiname …',
    describe: 'Bildtext (für Screenreader)',
    upload: 'Bild hochladen',
    uploading: 'Wird hochgeladen …',
    accept: 'image/jpeg,image/png,image/webp,image/gif',
    empty: 'Es sind noch keine Bilder vorhanden. Laden Sie oben das erste hoch.',
    nothingFound: 'Kein Bild passt zu dieser Suche.',
    loading: 'Bilder werden geladen …',
  },
  document: {
    title: 'Dokument wählen',
    sub: 'PDF, Word, Excel oder PowerPoint – aus dem Bestand oder neu hochladen.',
    search: 'Suchen nach Bezeichnung oder Dateiname …',
    describe: 'Bezeichnung (wird als Linktext vorgeschlagen)',
    upload: 'Dokument hochladen',
    uploading: 'Wird hochgeladen …',
    accept: '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx',
    empty: 'Es sind noch keine Dokumente vorhanden. Laden Sie oben das erste hoch.',
    nothingFound: 'Kein Dokument passt zu dieser Suche.',
    loading: 'Dokumente werden geladen …',
  },
};

/**
 * Dateiauswahl fuer den Block-Editor.
 *
 * Zeigt den vorhandenen Bestand und nimmt neue Dateien entgegen. Beides in
 * einem Fenster, weil es beim Schreiben eines Beitrags dieselbe Frage ist:
 * "welche Datei kommt hier hin" – manchmal liegt sie schon da, manchmal noch
 * auf dem Schreibtisch.
 *
 * `kind` entscheidet, ob Bilder oder Dokumente zur Wahl stehen. Getrennt und
 * nicht alles in einem Topf: in einen Bildbaustein gehoert kein PDF, und in
 * eine Download-Liste kein Foto. Die Beschriftungen stehen oben in WORDING –
 * dort beieinander statt ueber die Vorlage verstreut, damit sich eine
 * Betriebsart an einer Stelle lesen laesst.
 *
 * Die Komponente laedt selbst und gibt nur die gewaehlte Datei nach oben.
 * Der Editor muss dadurch nichts ueber den Bestand wissen.
 */
@Component({
  selector: 'app-media-picker',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './media-picker.html',
  styleUrl: './media-picker.css',
})
export class MediaPicker implements OnInit, AfterViewInit {
  private readonly api = inject(AdminApi);

  /** Bilder oder Dokumente? */
  readonly kind = input<MediaKind>('image');

  /**
   * Dateien, die im gerade offenen Beitrag stecken.
   *
   * Die API prueft die Verwendung in der Datenbank – eine Datei, die eben
   * erst in einen noch ungespeicherten Baustein gesetzt wurde, gilt dort
   * zu Recht als frei. Loeschen liesse sie sich also, und der Editor haette
   * danach einen toten Verweis stehen. Darum sperrt die Auswahl diese
   * Dateien zusaetzlich selbst.
   */
  readonly usedIds = input<number[]>([]);

  /** Die gewaehlte Datei. */
  readonly chosen = output<AdminMedia>();
  /** Abbrechen, ohne etwas zu waehlen. */
  readonly closed = output<void>();

  /** Beschriftungen der aktuellen Betriebsart. */
  readonly words = computed(() => WORDING[this.kind()]);

  /** Dokumente stehen als Liste, Bilder als Kachelraster. */
  readonly isDocuments = computed(() => this.kind() === 'document');

  private readonly fileInput = viewChild<ElementRef<HTMLInputElement>>('fileInput');
  private readonly panel = viewChild<ElementRef<HTMLElement>>('panel');

  readonly media = signal<AdminMedia[]>([]);
  readonly loading = signal(true);
  readonly uploading = signal(false);
  readonly error = signal('');

  /** Datei, deren Loeschung gerade bestaetigt werden soll. */
  readonly pending = signal<AdminMedia | null>(null);
  /** Datei, die gerade geloescht wird. */
  readonly deleting = signal<number | null>(null);
  /** Fundstellen aus einer abgelehnten Loeschung. */
  readonly usedBy = signal<string[]>([]);

  /** Suchbegriff, wird gegen Bezeichnung und Pfad geprueft. */
  search = '';
  /** Bezeichnung des naechsten Uploads. */
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

  /**
   * Geladen wird erst hier und nicht im Konstruktor: dort steht `kind` noch
   * auf dem Vorgabewert, und die Auswahl zeigte in einem Dokument-Baustein
   * die Bilder.
   */
  ngOnInit(): void {
    this.loading.set(true);
    this.api.media(this.kind()).subscribe({
      next: (media) => {
        this.media.set(media);
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set(apiErrorText(err, 'Der Bestand liess sich nicht laden.'));
        this.loading.set(false);
      },
    });
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
   * Nimmt die gewaehlte Datei entgegen und laedt sie hoch. Die fertige Datei
   * wird gleich uebernommen: wer eben eine ausgesucht hat, will sie an
   * dieser Stelle haben und nicht noch einmal anklicken.
   */
  onFile(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    this.error.set('');
    this.uploading.set(true);

    this.api.upload(file, this.uploadAlt.trim(), this.kind()).subscribe({
      next: (entry) => {
        this.uploading.set(false);
        this.uploadAlt = '';
        // Zuruecksetzen, sonst loest dieselbe Datei kein change-Ereignis
        // mehr aus und ein zweiter Versuch bliebe wirkungslos.
        input.value = '';
        this.media.update((list) => [entry, ...list]);
        this.chosen.emit(entry);
      },
      error: (err) => {
        this.uploading.set(false);
        input.value = '';
        this.error.set(apiErrorText(err, 'Die Datei liess sich nicht hochladen.'));
      },
    });
  }

  /** Bildmasse als "1600 × 900" – leer, wenn sie nicht gepflegt sind. */
  dimensions(image: AdminMedia): string {
    return image.width && image.height ? `${image.width} × ${image.height}` : '';
  }

  /** Dateiname ohne Ordner – die Zeile eines Dokuments zeigt ihn. */
  filename(entry: AdminMedia): string {
    return entry.path.split('/').pop() ?? entry.path;
  }

  /** Endung als Abzeichen: "PDF", "DOCX" … */
  extension(entry: AdminMedia): string {
    const value = this.filename(entry).split('.').pop() ?? '';
    return value === entry.path ? 'Datei' : value.toUpperCase();
  }

  /** Zweite Zeile eines Dokuments: Dateiname und, wenn bekannt, Groesse. */
  docMeta(entry: AdminMedia): string {
    const size = this.filesize(entry);
    return size === '' ? this.filename(entry) : `${this.filename(entry)} · ${size}`;
  }

  /** Dateigroesse als "412 KB" oder "1,2 MB". Leer, wenn sie fehlt. */
  filesize(entry: AdminMedia): string {
    const bytes = entry.bytes;
    if (bytes === null || bytes <= 0) return '';
    if (bytes < 1024) return `${bytes} B`;

    const kb = bytes / 1024;
    if (kb < 1000) return `${Math.round(kb)} KB`;

    return `${(kb / 1024).toFixed(1).replace('.', ',')} MB`;
  }

  // ── Löschen ────────────────────────────────────────────────

  /** Steckt die Datei im gerade offenen Beitrag? Dann bleibt sie hier. */
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
        // 409 heisst: die Datei haengt noch irgendwo. Die Fundstellen sind
        // die eigentliche Antwort – ohne sie muesste man raten.
        this.error.set(apiErrorText(err, 'Die Datei liess sich nicht löschen.'));
        this.usedBy.set(mediaUsedBy(err));
      },
    });
  }
}
