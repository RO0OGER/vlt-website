import { Component, ElementRef, computed, effect, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { AdminApi, AdminCategory, apiErrorText } from '../../../shared/admin-api';
import { slugify } from '../../../shared/blocks';

/**
 * Kategorien verwalten.
 *
 * Kategorien sortieren Beitraege und Alben und bilden die Filterleiste der
 * Beitragsuebersicht. Sie sind gemeinsam genutzt: eine Kategorie hier
 * anzulegen, macht sie sofort in jedem Beitragseditor auswaehlbar.
 *
 * Angelegt wird mit einem Namen, die Adresse entsteht daraus – dieselbe
 * Regel wie bei Beitraegen. Geloescht werden kann nur, was niemand
 * verwendet; alles andere wuerde die Kategorie still aus den Beitraegen
 * entfernen, die sie tragen.
 */
@Component({
  selector: 'app-admin-kategorien',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './kategorien.html',
  styleUrl: './kategorien.css',
})
export class Kategorien {
  private readonly api = inject(AdminApi);

  readonly categories = signal<AdminCategory[]>([]);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly creating = signal(false);
  readonly notice = signal('');

  readonly confirming = signal<AdminCategory | null>(null);
  readonly deleting = signal(false);

  /** Eingabe als Signal, damit die Adressvorschau mittippt. */
  readonly name = signal('');

  private readonly panel = viewChild<ElementRef<HTMLElement>>('panel');

  /** Vorschau der Adresse. Den endgueltigen Wert vergibt die API. */
  readonly slugPreview = computed(() => slugify(this.name().trim()));

  /**
   * Gibt es den Namen schon? Dann bremst die Oberflaeche, bevor die API
   * ablehnt – Kleinschreibung ignoriert, weil "Kurse" und "kurse" dieselbe
   * Rubrik meinen.
   */
  readonly duplicate = computed(() => {
    const name = this.name().trim().toLowerCase();
    if (name === '') return false;
    return this.categories().some((category) => category.name.toLowerCase() === name);
  });

  readonly canCreate = computed(() => {
    const name = this.name().trim();
    const duplicate = this.duplicate();
    const creating = this.creating();

    return !creating && name !== '' && !duplicate;
  });

  constructor() {
    this.load();
    effect(() => this.panel()?.nativeElement.focus());
  }

  load(): void {
    this.loading.set(true);
    this.error.set('');

    this.api.categories().subscribe({
      next: (categories) => {
        this.categories.set(categories);
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set(apiErrorText(err, 'Die Kategorien liessen sich nicht laden.'));
        this.loading.set(false);
      },
    });
  }

  // ── Anlegen ────────────────────────────────────────────────

  create(): void {
    if (!this.canCreate()) return;

    const name = this.name().trim();
    this.error.set('');
    this.notice.set('');
    this.creating.set(true);

    this.api.createCategory(name).subscribe({
      next: (category) => {
        this.creating.set(false);
        this.name.set('');
        this.notice.set(`«${category.name}» wurde angelegt.`);
        // Neu laden statt anhaengen: Reihenfolge und Zaehler kommen aus der API.
        this.load();
      },
      error: (err) => {
        this.creating.set(false);
        this.error.set(apiErrorText(err, 'Die Kategorie liess sich nicht anlegen.'));
      },
    });
  }

  // ── Löschen ────────────────────────────────────────────────

  askDelete(category: AdminCategory): void {
    this.error.set('');
    this.notice.set('');
    this.confirming.set(category);
  }

  cancelDelete(): void {
    this.confirming.set(null);
  }

  onConfirmKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape' && !this.deleting()) {
      this.cancelDelete();
    }
  }

  confirmDelete(): void {
    const category = this.confirming();
    if (!category || this.deleting()) return;

    this.deleting.set(true);
    this.api.removeCategory(category.id).subscribe({
      next: () => {
        this.deleting.set(false);
        this.confirming.set(null);
        this.categories.update((list) => list.filter((entry) => entry.id !== category.id));
      },
      error: (err) => {
        this.deleting.set(false);
        this.confirming.set(null);
        this.error.set(apiErrorText(err, 'Die Kategorie liess sich nicht löschen.'));
      },
    });
  }

  /** "3 Beiträge", "1 Album · 2 Beiträge" – oder der Hinweis, dass sie frei ist. */
  usageLabel(category: AdminCategory): string {
    const posts = category.postCount ?? 0;
    const albums = category.albumCount ?? 0;

    const teile: string[] = [];
    if (posts > 0) teile.push(posts === 1 ? '1 Beitrag' : `${posts} Beiträge`);
    if (albums > 0) teile.push(albums === 1 ? '1 Album' : `${albums} Alben`);

    return teile.length ? teile.join(' · ') : 'Wird nirgends verwendet';
  }
}
