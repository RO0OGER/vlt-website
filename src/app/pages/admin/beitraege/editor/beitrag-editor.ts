import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Title } from '@angular/platform-browser';
import { ActivatedRoute, Router } from '@angular/router';

import {
  AdminApi,
  AdminCategory,
  AdminMedia,
  AdminPostDetail,
  MediaKind,
  PostPayload,
  PostType,
  apiErrorText,
} from '../../../../shared/admin-api';
import {
  BLOCK_MAX_DOCUMENTS,
  BLOCK_TYPES,
  BlockKind,
  BlockPayload,
  BlockType,
  EditorBlock,
  MAP_ZOOM_DEFAULT,
  MAP_ZOOM_MAX,
  MAP_ZOOM_MIN,
  TABLE_MAX_COLUMNS,
  TABLE_MAX_ROWS,
  addTableColumn,
  addTableRow,
  blockSummary,
  blockType,
  createBlock,
  createDocument,
  isEmptyBlock,
  removeTableColumn,
  removeTableRow,
  setTableCell,
  slugify,
  tableColumns,
  toEditorBlocks,
  toPayloadBlocks,
} from '../../../../shared/blocks';
import { todayIso } from '../../../../shared/dates';
import { GeoResult, Geocoder, LatLng } from '../../../../shared/map/geo';
import { MapView } from '../../../../shared/map/map-view';
import { MediaPicker } from '../../../../shared/media-picker/media-picker';

/**
 * Die Adresssuche eines Karten-Bausteins. Es ist immer hoechstens eine
 * offen – die des Bausteins, in dem zuletzt gesucht wurde.
 */
interface GeoSearch {
  uid: number;
  busy: boolean;
  results: GeoResult[];
  /** Meldung, wenn nichts gefunden wurde oder die Suche scheiterte. */
  message: string;
}

/**
 * Was sich zwischen Beitrag und Event unterscheidet, soweit es nur Worte
 * und Adressen sind. Alles Weitere fragt die Vorlage ueber isEvent() ab.
 */
const WORDING: Record<
  PostType,
  { one: string; fresh: string; list: string; admin: string; site: string }
> = {
  post: { one: 'Beitrag', fresh: 'Neuer Beitrag', list: 'Beiträge', admin: '/admin/beitraege', site: '/beitraege' },
  event: { one: 'Event', fresh: 'Neues Event', list: 'Events', admin: '/admin/events', site: '/events' },
};

/**
 * Eine Preisstufe im Formular. Die uid haelt die Zeile beim Tippen stabil –
 * ohne sie baute @for die Eingabefelder bei jeder Aenderung neu auf, und der
 * Cursor sprang heraus.
 */
interface PriceRow {
  uid: number;
  label: string;
  value: string;
}

let nextPriceUid = 1;

function priceRow(label = '', value = ''): PriceRow {
  return { uid: nextPriceUid++, label, value };
}

/**
 * Woher ein laufender Zug kommt: aus der Bausteinleiste (ein neuer Block)
 * oder aus dem Beitrag selbst (ein bestehender wird umsortiert).
 */
type DragSource = { type: 'new'; kind: BlockKind } | { type: 'move'; uid: number };

/**
 * Wofuer die Dateiauswahl gerade offen ist: das Titelbild, ein Bildplatz in
 * einem Baustein, oder ein Dokument, das einer Download-Liste angehaengt
 * wird. Daraus leitet sich auch ab, welchen Bestand die Auswahl zeigt.
 */
type PickerTarget =
  | { kind: 'cover' }
  | { kind: 'image'; uid: number; slot: number }
  | { kind: 'document'; uid: number };

/**
 * Block-Editor fuer Beitraege und Events.
 *
 * Ein Beitrag wird hier aus Bausteinen zusammengesetzt: Text, Zwischentitel,
 * Bild, Bildpaar, Tabelle, Dokumente, Link, Karte, Zitat. Die Bausteinleiste links
 * laesst sich in den Beitrag ziehen, bestehende Bloecke lassen sich am Griff
 * umsortieren. Wer nicht ziehen mag oder kann, kommt mit den Knoepfen genauso
 * ans Ziel – jede Zieh-Geste hat eine Entsprechung zum Anklicken.
 *
 * Welche Felder ein Baustein zeigt, entscheidet seine Beigabe (BlockPayload
 * in blocks.ts) und nicht eine Abfrage auf die Art. So braucht eine neue Art
 * hier nichts weiter, solange sie eine der vier bekannten Beigaben hat.
 *
 * Gespeichert wird immer der ganze Beitrag: Kopfdaten und alle Bloecke in
 * einem Aufruf. Das haelt den Zustand einfach – es gibt keinen Moment, in
 * dem die Haelfte gespeichert ist.
 *
 * Events benutzen denselben Editor (Route-Daten `type: 'event'`). Sie haben
 * dieselben Bausteine ausser der Karte, dazu die Angaben eines
 * Verbandsanlasses – dieselben wie frueher bei guidle, ohne den Plan: Datum
 * und Ort (Pflicht), Beginn, Ende, Adresse, Preise, Anmeldung, Zielgruppe,
 * Zutritt. Sie stehen gesammelt im Feld "Eckdaten" ueber dem Inhalt.
 * Veroeffentlichungsdatum und Autor fallen weg – bei einem Event zaehlt,
 * wann und wo es stattfindet, nicht wer es eingetragen hat.
 */
@Component({
  selector: 'app-beitrag-editor',
  standalone: true,
  imports: [FormsModule, MediaPicker, MapView],
  templateUrl: './beitrag-editor.html',
  styleUrl: './beitrag-editor.css',
})
export class BeitragEditor {
  private readonly api = inject(AdminApi);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly titleService = inject(Title);
  private readonly geocoder = inject(Geocoder);

  /** Beitrag oder Event – steht in den Daten der Route. */
  readonly kind: PostType = this.route.snapshot.data['type'] === 'event' ? 'event' : 'post';
  readonly isEvent = this.kind === 'event';

  /**
   * Die Bausteinleiste. Events bekommen keine Karte mehr: ihr Ort steht in
   * den Eckdaten, und "Route planen" fuehrt hin. Eine Karte aus einem
   * aelteren Event bleibt trotzdem bearbeitbar, bis man sie entfernt.
   */
  readonly types = this.isEvent ? BLOCK_TYPES.filter((type) => type.kind !== 'map') : BLOCK_TYPES;

  /** Hoechstzahl der Preisstufen; dieselbe Grenze kennt die API. */
  readonly maxPrices = 8;
  readonly words = WORDING[this.kind];

  readonly zoomMin = MAP_ZOOM_MIN;
  readonly zoomMax = MAP_ZOOM_MAX;

  /** Nummer des Beitrags, null solange er neu ist. */
  readonly postId = signal<number | null>(null);
  readonly blocks = signal<EditorBlock[]>([]);
  readonly categories = signal<AdminCategory[]>([]);
  readonly cover = signal<AdminMedia | null>(null);

  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly error = signal('');
  readonly notice = signal('');
  readonly dirty = signal(false);

  // ── Kopfdaten ──────────────────────────────────────────────
  // Einfache Felder statt Signale: sie haengen an [(ngModel)] und werden nur
  // vom Formular selbst geaendert. Was die Oberflaeche daraus ableitet
  // (Adressvorschau, Status), liegt weiter unten in Signalen.
  title = '';
  excerpt = '';
  date = todayIso();
  author = '';
  categoryId: number | null = null;
  extraCategoryIds: number[] = [];

  // Nur bei Events. Datum und Ort sind Pflicht, die Zeiten nicht: manches
  // Event dauert den ganzen Tag, und eine erfundene Uhrzeit waere schlimmer
  // als keine.
  eventDate = '';
  eventStart = '';
  eventEnd = '';
  kicker = '';
  location = '';
  street = '';
  city = '';
  registrationUrl = '';
  audience = '';
  admission = '';
  membersOnly = false;
  readonly prices = signal<PriceRow[]>([]);

  /** Die offene Adresssuche eines Karten-Bausteins. */
  readonly geo = signal<GeoSearch | null>(null);

  readonly status = signal<'draft' | 'published'>('draft');

  /**
   * Die Adresse, wie sie gespeichert ist – fuer den "Ansehen"-Link, der auf
   * die oeffentliche Seite zeigt. Nur die API setzt sie.
   */
  readonly slug = signal('');

  /**
   * Die Adresse, wie sie nach dem Speichern voraussichtlich aussieht. Zieht
   * beim Tippen mit dem Titel mit und wird nach dem Speichern durch den
   * echten Wert ersetzt.
   */
  readonly slugPreview = signal('');

  /**
   * Die Lesedauer wird im CMS nicht mehr gepflegt – sie stand in keinem
   * Verhaeltnis zum Aufwand, sie zu pflegen. Der gespeicherte Wert wird
   * aber weiter gelesen und unveraendert zurueckgeschickt: sonst waere er
   * beim ersten Speichern eines alten Beitrags geloescht, und die Karten
   * in der Uebersicht verloeren ihre Angabe ("6 min").
   */
  private readMinutes: number | null = null;

  // ── Ziehen und Ablegen ─────────────────────────────────────
  readonly drag = signal<DragSource | null>(null);
  /** Stelle, an der beim Loslassen eingefuegt wird (0 … Anzahl Bloecke). */
  readonly dropIndex = signal<number | null>(null);
  /** Block, dessen Griff gerade gedrueckt ist – nur der darf gezogen werden. */
  readonly handle = signal<number | null>(null);

  readonly picker = signal<PickerTarget | null>(null);

  readonly isNew = computed(() => this.postId() === null);

  /** Welchen Bestand die Auswahl zeigt: Bilder oder Dokumente. */
  readonly pickerKind = computed<MediaKind>(() =>
    this.picker()?.kind === 'document' ? 'document' : 'image',
  );

  /**
   * Alle Dateien, die dieser Beitrag gerade belegt – Titelbild, Bilder in
   * Bausteinen und Dokumente in Download-Listen. Die Auswahl sperrt sie
   * fuers Loeschen, auch wenn sie noch nicht gespeichert sind und in der
   * Datenbank darum als frei gelten.
   */
  readonly usedMediaIds = computed(() => {
    const ids = this.blocks().flatMap((block) => [
      ...block.images.filter((image) => image !== null).map((image) => image.id),
      ...block.documents.map((document) => document.file.id),
    ]);
    const coverId = this.cover()?.id;
    return coverId === undefined ? ids : [...ids, coverId];
  });

  /** Bloecke ohne Inhalt. Die API weist sie ab, hier faellt es vorher auf. */
  readonly emptyBlocks = computed(() =>
    this.blocks()
      .map((block, index) => ({ block, index }))
      .filter((entry) => isEmptyBlock(entry.block)),
  );

  constructor() {
    const param = this.route.snapshot.paramMap.get('id');
    const id = param !== null && param !== 'neu' && /^\d+$/.test(param) ? Number(param) : null;

    this.api.categories().subscribe({
      next: (categories) => this.categories.set(categories),
      // Ohne Kategorien laesst sich trotzdem schreiben – das Auswahlfeld
      // bleibt dann leer. Eine Fehlermeldung waere hier nur im Weg.
      error: () => this.categories.set([]),
    });

    if (id === null) {
      this.titleService.setTitle(`${this.words.fresh} – VLT Admin`);
      this.loading.set(false);
      // Ein leerer Textblock, damit man sofort schreiben kann statt erst
      // einen Baustein suchen zu muessen.
      this.blocks.set([createBlock('text')]);
      // Zwei leere Preiszeilen zum Ausfuellen oder Leerlassen – leere
      // Zeilen werden nicht gespeichert. Die Vorschlaege stehen als
      // Platzhalter darin (pricePlaceholder).
      if (this.isEvent) this.prices.set([priceRow(), priceRow()]);
      return;
    }

    this.postId.set(id);
    this.api.post(id, this.kind).subscribe({
      next: (post) => {
        this.fill(post);
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set(apiErrorText(err, `${this.words.one} liess sich nicht laden.`));
        this.loading.set(false);
      },
    });
  }

  /** Uebernimmt einen geladenen Beitrag in das Formular. */
  private fill(post: AdminPostDetail): void {
    this.title = post.title;
    this.slug.set(post.slug);
    this.excerpt = post.excerpt;
    this.date = post.date ?? todayIso();
    this.author = post.author ?? '';
    this.readMinutes = post.readMinutes ?? null;
    this.categoryId = post.categoryId;
    this.extraCategoryIds = post.categoryIds;
    this.eventDate = post.eventDate ?? '';
    this.eventStart = post.eventStart ?? '';
    this.eventEnd = post.eventEnd ?? '';
    this.kicker = post.kicker ?? '';
    this.location = post.location ?? '';
    this.street = post.street ?? '';
    this.city = post.city ?? '';
    this.registrationUrl = post.registrationUrl ?? '';
    this.audience = post.audience ?? '';
    this.admission = post.admission ?? '';
    this.membersOnly = post.membersOnly ?? false;
    this.prices.set((post.prices ?? []).map((price) => priceRow(price.label, price.value)));
    this.status.set(post.status);
    this.slugPreview.set(post.slug);

    this.blocks.set(toEditorBlocks(post.blocks));
    this.cover.set(post.cover);

    this.titleService.setTitle(`${post.title} – VLT Admin`);
    this.dirty.set(false);
  }

  // ── Kopfdaten ──────────────────────────────────────────────

  /** Jede Aenderung macht den Beitrag ungespeichert. */
  touch(): void {
    this.dirty.set(true);
    this.notice.set('');
  }

  /**
   * Die Adresse zieht mit dem Titel mit.
   *
   * Was hier steht, ist nur eine Vorschau: den endgueltigen Wert vergibt
   * die API, denn nur sie weiss, ob der Name schon vergeben ist und ein
   * "-2" angehaengt werden muss. Nach dem Speichern wird die Anzeige mit
   * der Antwort ueberschrieben.
   */
  onTitleChange(value: string): void {
    this.touch();
    this.slugPreview.set(slugify(value));
  }

  setStatus(status: 'draft' | 'published'): void {
    this.status.set(status);
    this.touch();
  }

  /**
   * Schaltet eine weitere Kategorie an oder aus.
   *
   * Ist noch keine Hauptkategorie gesetzt, wird die erste angehakte dazu.
   * Ohne das bliebe sie auf "keine" stehen – und der Beitrag erschiene auf
   * der Website unter "Ohne Kategorie", obwohl unten Kategorien angehakt
   * sind. Genau diese Stelle hat in der Praxis gestolpert.
   */
  toggleCategory(id: number, checked: boolean): void {
    if (checked && this.categoryId === null) {
      this.categoryId = id;
      this.touch();
      return;
    }

    this.extraCategoryIds = checked
      ? [...this.extraCategoryIds, id]
      : this.extraCategoryIds.filter((value) => value !== id);
    this.touch();
  }

  hasCategory(id: number): boolean {
    return this.extraCategoryIds.includes(id);
  }

  // ── Preise ─────────────────────────────────────────────────

  addPrice(): void {
    if (this.prices().length >= this.maxPrices) return;
    this.prices.update((list) => [...list, priceRow()]);
    this.touch();
  }

  setPrice(uid: number, field: 'label' | 'value', text: string): void {
    this.prices.update((list) => list.map((row) => (row.uid === uid ? { ...row, [field]: text } : row)));
    this.touch();
  }

  /** Vorschlag in der leeren Zeile: die Stufen, die fast jeder Anlass hat. */
  pricePlaceholder(index: number): string {
    return ['z. B. Mitglieder', 'z. B. Nichtmitglieder'].at(index) ?? 'Bezeichnung';
  }

  removePrice(uid: number): void {
    this.prices.update((list) => list.filter((row) => row.uid !== uid));
    this.touch();
  }

  // ── Bausteine ──────────────────────────────────────────────

  type(kind: BlockKind): BlockType {
    return blockType(kind);
  }

  /** Welche Felder ein Baustein zeigt – die Vorlage schaltet danach. */
  payload(kind: BlockKind): BlockPayload {
    return blockType(kind).payload;
  }

  summary(block: EditorBlock): string {
    return blockSummary(block);
  }

  empty(block: EditorBlock): boolean {
    return isEmptyBlock(block);
  }

  /**
   * Aendert einen Block. Neues Objekt statt Mutation, damit die abgeleiteten
   * Anzeigen (leer? Zusammenfassung?) mitbekommen, was los ist.
   */
  private patch(uid: number, change: (block: EditorBlock) => EditorBlock): void {
    this.blocks.update((list) => list.map((block) => (block.uid === uid ? change(block) : block)));
    this.touch();
  }

  /** Setzt den Text eines Blocks. */
  setText(uid: number, text: string): void {
    this.patch(uid, (block) => ({ ...block, text }));
  }

  /** Setzt die Adresse eines Link-Bausteins. */
  setUrl(uid: number, url: string): void {
    this.patch(uid, (block) => ({ ...block, url }));
  }

  /** Haengt einen Baustein an – der Weg ohne Maus. */
  addBlock(kind: BlockKind): void {
    this.blocks.update((list) => [...list, createBlock(kind)]);
    this.touch();
  }

  removeBlock(uid: number): void {
    this.blocks.update((list) => list.filter((block) => block.uid !== uid));
    this.touch();
  }

  /** Verschiebt einen Block um eine Stelle. Gleichwertig zum Ziehen. */
  move(uid: number, direction: -1 | 1): void {
    this.blocks.update((list) => {
      const from = list.findIndex((block) => block.uid === uid);
      const to = from + direction;
      if (from < 0 || to < 0 || to >= list.length) return list;

      const next = [...list];
      [next[from], next[to]] = [next[to], next[from]];
      return next;
    });
    this.touch();
  }

  indexOf(uid: number): number {
    return this.blocks().findIndex((block) => block.uid === uid);
  }

  // ── Tabelle ────────────────────────────────────────────────
  // Die Umformungen selbst stehen in blocks.ts: sie gehoeren zur Tabelle,
  // nicht zum Editor, und werden dort auch gebraucht, wenn ein geladener
  // Beitrag in die Form des Editors kommt.

  columns(block: EditorBlock): number {
    return tableColumns(block.table);
  }

  /** Spaltenbreite als Liste, damit die Vorlage die Kopfleiste zeichnen kann. */
  columnIndexes(block: EditorBlock): number[] {
    return Array.from({ length: tableColumns(block.table) }, (_, index) => index);
  }

  setCell(uid: number, row: number, column: number, value: string): void {
    this.patch(uid, (block) => ({ ...block, table: setTableCell(block.table, row, column, value) }));
  }

  /** Erste Zeile als Kopfzeile darstellen – oder eben nicht. */
  toggleTableHead(uid: number, head: boolean): void {
    this.patch(uid, (block) => ({ ...block, table: { ...block.table, head } }));
  }

  addRow(uid: number): void {
    this.patch(uid, (block) => ({ ...block, table: addTableRow(block.table) }));
  }

  removeRow(uid: number, row: number): void {
    this.patch(uid, (block) => ({ ...block, table: removeTableRow(block.table, row) }));
  }

  addColumn(uid: number): void {
    this.patch(uid, (block) => ({ ...block, table: addTableColumn(block.table) }));
  }

  removeColumn(uid: number, column: number): void {
    this.patch(uid, (block) => ({ ...block, table: removeTableColumn(block.table, column) }));
  }

  canAddRow(block: EditorBlock): boolean {
    return block.table.rows.length < TABLE_MAX_ROWS;
  }

  canAddColumn(block: EditorBlock): boolean {
    return tableColumns(block.table) < TABLE_MAX_COLUMNS;
  }

  // ── Dokumente ──────────────────────────────────────────────

  canAddDocument(block: EditorBlock): boolean {
    return block.documents.length < BLOCK_MAX_DOCUMENTS;
  }

  /** Beschriftung einer Datei – das, was im Beitrag als Linktext steht. */
  setDocumentLabel(uid: number, documentUid: number, label: string): void {
    this.patch(uid, (block) => ({
      ...block,
      documents: block.documents.map((document) =>
        document.uid === documentUid ? { ...document, label } : document,
      ),
    }));
  }

  removeDocument(uid: number, documentUid: number): void {
    this.patch(uid, (block) => ({
      ...block,
      documents: block.documents.filter((document) => document.uid !== documentUid),
    }));
  }

  /** Verschiebt eine Datei in der Liste; die Reihenfolge steht so im Beitrag. */
  moveDocument(uid: number, documentUid: number, direction: -1 | 1): void {
    this.patch(uid, (block) => {
      const from = block.documents.findIndex((document) => document.uid === documentUid);
      const to = from + direction;
      if (from < 0 || to < 0 || to >= block.documents.length) return block;

      const documents = [...block.documents];
      [documents[from], documents[to]] = [documents[to], documents[from]];
      return { ...block, documents };
    });
  }

  /** Dateiname ohne Ordner – er steht unter der Beschriftung. */
  filename(file: AdminMedia): string {
    return file.path.split('/').pop() ?? file.path;
  }

  /** Endung als Abzeichen vor der Zeile: "PDF", "DOCX" … */
  extension(file: AdminMedia): string {
    const name = this.filename(file);
    const value = name.split('.').pop() ?? '';
    return value === name ? 'Datei' : value.toUpperCase();
  }

  // ── Karte ──────────────────────────────────────────────────

  /**
   * Sucht die Adresse eines Karten-Bausteins.
   *
   * Gesucht wird nach dem, was im Adressfeld des Bausteins steht – und wenn
   * das leer ist, nach dem Ort aus den Kopfdaten des Events. So genuegt bei
   * einem Event oft ein Klick, weil der Ort schon eingetragen ist.
   */
  searchAddress(block: EditorBlock): void {
    const query = block.text.trim() || this.location.trim();
    if (query === '') {
      this.geo.set({ uid: block.uid, busy: false, results: [], message: 'Geben Sie zuerst eine Adresse ein.' });
      return;
    }

    this.geo.set({ uid: block.uid, busy: true, results: [], message: '' });
    this.geocoder.search(query).subscribe({
      next: (results) => {
        // Nur uebernehmen, wenn nicht inzwischen in einem anderen Baustein
        // gesucht wird – sonst landete die Antwort am falschen Ort.
        if (this.geo()?.uid !== block.uid) return;

        // Ein einziger Treffer ist eindeutig: gleich setzen statt eine Liste
        // mit einem Eintrag zum Anklicken zu zeigen.
        if (results.length === 1) {
          this.chooseResult(block.uid, results[0]);
          return;
        }
        this.geo.set({
          uid: block.uid,
          busy: false,
          results,
          message: results.length === 0 ? 'Keine Adresse gefunden. Versuchen Sie es mit Strasse und Ort.' : '',
        });
      },
      error: () => {
        if (this.geo()?.uid !== block.uid) return;
        this.geo.set({
          uid: block.uid,
          busy: false,
          results: [],
          message: 'Die Adresssuche ist gerade nicht erreichbar. Klicken Sie den Ort direkt in der Karte an.',
        });
      },
    });
  }

  /** Uebernimmt einen Treffer der Suche als Standort. */
  chooseResult(uid: number, result: GeoResult): void {
    this.geo.set(null);
    this.patch(uid, (block) => ({
      ...block,
      // Die gefundene Adresse in ihrer Kurzform: "Lüssiweg 24, 6300 Zug"
      // ist meist genauer als das, was eingetippt wurde ("lüssiweg zug").
      text: result.short,
      location: {
        lat: result.lat,
        lng: result.lng,
        zoom: block.location?.zoom ?? MAP_ZOOM_DEFAULT,
      },
    }));
  }

  /** Ein Klick in die Karte versetzt die Markierung. */
  pickLocation(uid: number, point: LatLng): void {
    this.patch(uid, (block) => ({
      ...block,
      location: { lat: point.lat, lng: point.lng, zoom: block.location?.zoom ?? MAP_ZOOM_DEFAULT },
    }));
  }

  zoomMap(uid: number, step: -1 | 1): void {
    this.patch(uid, (block) => {
      if (!block.location) return block;
      const zoom = Math.max(MAP_ZOOM_MIN, Math.min(MAP_ZOOM_MAX, block.location.zoom + step));
      return { ...block, location: { ...block.location, zoom } };
    });
  }

  clearLocation(uid: number): void {
    this.patch(uid, (block) => ({ ...block, location: null }));
  }

  /** Enter im Adressfeld einer Karte sucht, statt nichts zu tun. */
  onTextKey(block: EditorBlock, event: KeyboardEvent): void {
    if (block.kind === 'map' && event.key === 'Enter') {
      event.preventDefault();
      this.searchAddress(block);
    }
  }

  // ── Ziehen und Ablegen ─────────────────────────────────────

  /**
   * Ein Baustein aus der Leiste wird aufgenommen.
   *
   * setData ist Pflicht: ohne Nutzlast bricht Firefox den Zug sofort ab.
   * Gelesen wird sie nie – die Quelle steht im Signal.
   */
  startNew(kind: BlockKind, event: DragEvent): void {
    this.drag.set({ type: 'new', kind });
    event.dataTransfer?.setData('text/plain', kind);
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'copy';
  }

  startMove(uid: number, event: DragEvent): void {
    // Gezogen wird nur am Griff. Sonst liesse sich ein Block nicht mehr
    // markieren, ohne dass er gleich davonfliegt.
    if (this.handle() !== uid) {
      event.preventDefault();
      return;
    }
    this.drag.set({ type: 'move', uid });
    event.dataTransfer?.setData('text/plain', String(uid));
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
  }

  /**
   * Ueber einer Ablegestelle. preventDefault ist das Signal an den Browser,
   * dass hier abgelegt werden darf – ohne den Aufruf bleibt jede Flaeche
   * fuer den Zug gesperrt.
   */
  overZone(index: number, event: DragEvent): void {
    if (!this.drag()) return;
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = this.drag()?.type === 'new' ? 'copy' : 'move';
    }
    this.dropIndex.set(index);
  }

  dropAt(index: number, event: DragEvent): void {
    event.preventDefault();
    const source = this.drag();
    this.endDrag();
    if (!source) return;

    if (source.type === 'new') {
      this.blocks.update((list) => [
        ...list.slice(0, index),
        createBlock(source.kind),
        ...list.slice(index),
      ]);
      this.touch();
      return;
    }

    this.blocks.update((list) => {
      const from = list.findIndex((block) => block.uid === source.uid);
      if (from < 0) return list;

      const next = [...list];
      const [moved] = next.splice(from, 1);
      // Nach dem Herausnehmen rutscht alles dahinter eine Stelle vor – die
      // Zielstelle muss mitrutschen, sonst landet der Block daneben.
      next.splice(index > from ? index - 1 : index, 0, moved);
      return next;
    });
    this.touch();
  }

  endDrag(): void {
    this.drag.set(null);
    this.dropIndex.set(null);
    this.handle.set(null);
  }

  // ── Dateien ────────────────────────────────────────────────

  openCoverPicker(): void {
    this.picker.set({ kind: 'cover' });
  }

  openBlockPicker(uid: number, slot: number): void {
    this.picker.set({ kind: 'image', uid, slot });
  }

  openDocumentPicker(uid: number): void {
    this.picker.set({ kind: 'document', uid });
  }

  closePicker(): void {
    this.picker.set(null);
  }

  /** Nimmt die gewaehlte Datei an der Stelle entgegen, von der aus gewaehlt wurde. */
  onMediaChosen(file: AdminMedia): void {
    const target = this.picker();
    this.picker.set(null);
    if (!target) return;

    if (target.kind === 'cover') {
      this.cover.set(file);
      this.touch();
      return;
    }

    if (target.kind === 'document') {
      this.patch(target.uid, (block) => ({
        ...block,
        documents: [...block.documents, createDocument(file)],
      }));
      return;
    }

    this.patch(target.uid, (block) => {
      const images = [...block.images];
      images[target.slot] = file;
      return { ...block, images };
    });
  }

  clearCover(): void {
    this.cover.set(null);
    this.touch();
  }

  clearBlockImage(uid: number, slot: number): void {
    this.patch(uid, (block) => {
      const images = [...block.images];
      images[slot] = null;
      return { ...block, images };
    });
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
    if (this.isEvent && this.eventDate === '') {
      this.error.set('Ein Event braucht ein Datum.');
      return;
    }
    if (this.isEvent && this.location.trim() === '') {
      this.error.set('Ein Event braucht einen Ort.');
      return;
    }
    if (this.isEvent && this.eventEnd !== '' && this.eventStart === '') {
      this.error.set('Ein Ende ohne Beginn ergibt keinen Sinn. Tragen Sie zuerst den Beginn ein.');
      return;
    }
    if (this.isEvent && this.eventStart !== '' && this.eventEnd !== '' && this.eventEnd <= this.eventStart) {
      this.error.set('Das Ende muss nach dem Beginn liegen.');
      return;
    }
    const halfPrice = this.prices().findIndex(
      (row) => (row.label.trim() === '') !== (row.value.trim() === ''),
    );
    if (this.isEvent && halfPrice >= 0) {
      this.error.set(`Preis ${halfPrice + 1} braucht eine Bezeichnung und einen Betrag.`);
      return;
    }
    if (this.emptyBlocks().length > 0) {
      const stellen = this.emptyBlocks().map((entry) => entry.index + 1).join(', ');
      this.error.set(`Diese Bausteine sind noch leer: ${stellen}. Füllen oder entfernen Sie sie.`);
      return;
    }

    const payload: PostPayload = {
      title: this.title.trim(),
      // Kein slug: die Adresse leitet die API aus dem Titel ab. Sie hier
      // mitzuschicken hiesse, die Regel an zwei Stellen zu pflegen.
      excerpt: this.excerpt.trim(),
      date: this.date,
      eventDate: this.eventDate,
      eventStart: this.eventStart,
      eventEnd: this.eventEnd,
      location: this.location.trim(),
      kicker: this.kicker.trim(),
      street: this.street.trim(),
      city: this.city.trim(),
      // Ganz leere Zeilen (etwa die vorgeschlagenen, nie ausgefuellten)
      // fallen weg, statt die API damit zu behelligen.
      prices: this.prices()
        .map((row) => ({ label: row.label.trim(), value: row.value.trim() }))
        .filter((row) => row.label !== '' || row.value !== ''),
      registrationUrl: this.registrationUrl.trim(),
      audience: this.audience.trim(),
      admission: this.admission.trim(),
      membersOnly: this.membersOnly,
      author: this.author.trim(),
      readMinutes: this.readMinutes,
      status: this.status(),
      coverId: this.cover()?.id ?? null,
      categoryId: this.categoryId,
      // Die Hauptkategorie steht schon in categoryId; sie hier zu wiederholen
      // wuerde sie auf der Detailseite doppelt anzeigen.
      categoryIds: this.extraCategoryIds.filter((id) => id !== this.categoryId),
      blocks: toPayloadBlocks(this.blocks()),
    };

    this.saving.set(true);
    const id = this.postId();
    const request =
      id === null ? this.api.create(payload, this.kind) : this.api.update(id, payload, this.kind);

    request.subscribe({
      next: (result) => {
        this.saving.set(false);
        this.dirty.set(false);
        // Die API kann den Slug angepasst haben, wenn er schon vergeben war.
        this.slug.set(result.slug);
        this.slugPreview.set(result.slug);
        this.notice.set(
          this.status() === 'published' ? 'Gespeichert und veröffentlicht.' : 'Als Entwurf gespeichert.',
        );

        if (id === null) {
          this.postId.set(result.id);
          // Adresse nachziehen: ein Neuladen soll jetzt diesen Beitrag
          // oeffnen und nicht wieder ein leeres Formular.
          this.router.navigate([this.words.admin, result.id], { replaceUrl: true });
        }
      },
      error: (err) => {
        this.saving.set(false);
        this.error.set(apiErrorText(err, `${this.words.one} liess sich nicht speichern.`));
      },
    });
  }

  /** Zurueck zur Uebersicht, mit Rueckfrage bei ungespeicherten Aenderungen. */
  back(): void {
    if (this.dirty() && !confirm('Es gibt ungespeicherte Änderungen. Trotzdem zurück?')) {
      return;
    }
    this.router.navigate([this.words.admin]);
  }
}
