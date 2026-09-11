import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Title } from '@angular/platform-browser';
import { ActivatedRoute, Router } from '@angular/router';

import {
  AdminApi,
  AdminCategory,
  AdminMedia,
  AdminPostDetail,
  PostPayload,
  apiErrorText,
} from '../../../../shared/admin-api';
import {
  BLOCK_TYPES,
  BlockKind,
  BlockType,
  EditorBlock,
  blockSummary,
  blockType,
  createBlock,
  isEmptyBlock,
  slugify,
  toEditorBlocks,
  toPayloadBlocks,
} from '../../../../shared/blocks';
import { MediaPicker } from '../media-picker/media-picker';

/**
 * Woher ein laufender Zug kommt: aus der Bausteinleiste (ein neuer Block)
 * oder aus dem Beitrag selbst (ein bestehender wird umsortiert).
 */
type DragSource = { type: 'new'; kind: BlockKind } | { type: 'move'; uid: number };

/** Wofuer die Bildauswahl gerade offen ist. */
type PickerTarget = { kind: 'cover' } | { kind: 'block'; uid: number; slot: number };

/**
 * Block-Editor fuer Beitraege.
 *
 * Ein Beitrag wird hier aus Bausteinen zusammengesetzt: Text, Zwischentitel,
 * Bild, Bildpaar, Zitat. Die Bausteinleiste links laesst sich in den Beitrag
 * ziehen, bestehende Bloecke lassen sich am Griff umsortieren. Wer nicht
 * ziehen mag oder kann, kommt mit den Knoepfen genauso ans Ziel – jede
 * Zieh-Geste hat eine Entsprechung zum Anklicken.
 *
 * Gespeichert wird immer der ganze Beitrag: Kopfdaten und alle Bloecke in
 * einem Aufruf. Das haelt den Zustand einfach – es gibt keinen Moment, in
 * dem die Haelfte gespeichert ist.
 */
@Component({
  selector: 'app-beitrag-editor',
  standalone: true,
  imports: [FormsModule, MediaPicker],
  templateUrl: './beitrag-editor.html',
  styleUrl: './beitrag-editor.css',
})
export class BeitragEditor {
  private readonly api = inject(AdminApi);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly titleService = inject(Title);

  readonly types = BLOCK_TYPES;

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

  /**
   * Alle Bilder, die dieser Beitrag gerade belegt – Titelbild und Bausteine.
   * Die Bildauswahl sperrt sie fuers Loeschen, auch wenn sie noch nicht
   * gespeichert sind und in der Datenbank darum als frei gelten.
   */
  readonly usedImageIds = computed(() => {
    const ids = this.blocks().flatMap((block) =>
      block.images.filter((image) => image !== null).map((image) => image.id),
    );
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
      this.titleService.setTitle('Neuer Beitrag – VLT Admin');
      this.loading.set(false);
      // Ein leerer Textblock, damit man sofort schreiben kann statt erst
      // einen Baustein suchen zu muessen.
      this.blocks.set([createBlock('text')]);
      return;
    }

    this.postId.set(id);
    this.api.post(id).subscribe({
      next: (post) => {
        this.fill(post);
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set(apiErrorText(err, 'Der Beitrag liess sich nicht laden.'));
        this.loading.set(false);
      },
    });
  }

  /** Uebernimmt einen geladenen Beitrag in das Formular. */
  private fill(post: AdminPostDetail): void {
    this.title = post.title;
    this.slug.set(post.slug);
    this.excerpt = post.excerpt;
    this.date = post.date;
    this.author = post.author ?? '';
    this.readMinutes = post.readMinutes;
    this.categoryId = post.categoryId;
    this.extraCategoryIds = post.categoryIds;
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

  // ── Bausteine ──────────────────────────────────────────────

  type(kind: BlockKind): BlockType {
    return blockType(kind);
  }

  summary(block: EditorBlock): string {
    return blockSummary(block);
  }

  empty(block: EditorBlock): boolean {
    return isEmptyBlock(block);
  }

  /** Setzt den Text eines Blocks. Neues Objekt statt Mutation, damit die
   *  abgeleiteten Anzeigen (leer? Zusammenfassung?) mitbekommen, was los ist. */
  setText(uid: number, text: string): void {
    this.blocks.update((list) =>
      list.map((block) => (block.uid === uid ? { ...block, text } : block)),
    );
    this.touch();
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

  // ── Bilder ─────────────────────────────────────────────────

  openCoverPicker(): void {
    this.picker.set({ kind: 'cover' });
  }

  openBlockPicker(uid: number, slot: number): void {
    this.picker.set({ kind: 'block', uid, slot });
  }

  closePicker(): void {
    this.picker.set(null);
  }

  onImageChosen(image: AdminMedia): void {
    const target = this.picker();
    this.picker.set(null);
    if (!target) return;

    if (target.kind === 'cover') {
      this.cover.set(image);
    } else {
      this.blocks.update((list) =>
        list.map((block) => {
          if (block.uid !== target.uid) return block;
          const images = [...block.images];
          images[target.slot] = image;
          return { ...block, images };
        }),
      );
    }
    this.touch();
  }

  clearCover(): void {
    this.cover.set(null);
    this.touch();
  }

  clearBlockImage(uid: number, slot: number): void {
    this.blocks.update((list) =>
      list.map((block) => {
        if (block.uid !== uid) return block;
        const images = [...block.images];
        images[slot] = null;
        return { ...block, images };
      }),
    );
    this.touch();
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
    const request = id === null ? this.api.create(payload) : this.api.update(id, payload);

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
          this.router.navigate(['/admin/beitraege', result.id], { replaceUrl: true });
        }
      },
      error: (err) => {
        this.saving.set(false);
        this.error.set(apiErrorText(err, 'Der Beitrag liess sich nicht speichern.'));
      },
    });
  }

  /** Zurueck zur Uebersicht, mit Rueckfrage bei ungespeicherten Aenderungen. */
  back(): void {
    if (this.dirty() && !confirm('Es gibt ungespeicherte Änderungen. Trotzdem zurück?')) {
      return;
    }
    this.router.navigate(['/admin/beitraege']);
  }
}

/** Heutiges Datum als JJJJ-MM-TT – das Format, das die API erwartet. */
function todayIso(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}
