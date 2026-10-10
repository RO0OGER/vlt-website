import { Component, computed, inject, signal } from '@angular/core';

import { AdminApi, AdminMedia, apiErrorText } from '../../../shared/admin-api';
import { MediaPicker } from '../../../shared/media-picker/media-picker';

/**
 * Die Startseite im CMS: heute das grosse Titelbild neben der Ueberschrift.
 *
 * Gespeichert wird sofort nach der Wahl – es gibt nur dieses eine Feld, ein
 * eigener Speichern-Knopf waere ein Schritt, den man vergessen kann. Die
 * Vorschau zeigt das Bild so, wie es auf der Seite steht: im dunklen
 * Kopfband neben dem Titel, im Hochformat beschnitten.
 */
@Component({
  selector: 'app-admin-startseite',
  standalone: true,
  imports: [MediaPicker],
  templateUrl: './startseite-admin.html',
  styleUrl: './startseite-admin.css',
})
export class StartseiteAdmin {
  private readonly api = inject(AdminApi);

  readonly hero = signal<AdminMedia | null>(null);
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly error = signal('');
  readonly notice = signal('');
  readonly picking = signal(false);

  /** Das aktuelle Bild ist in Gebrauch – die Auswahl sperrt es fuers Loeschen. */
  readonly usedIds = computed(() => {
    const hero = this.hero();
    return hero ? [hero.id] : [];
  });

  constructor() {
    this.api.home().subscribe({
      next: (home) => {
        this.hero.set(home.heroImage);
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set(apiErrorText(err, 'Die Startseite liess sich nicht laden.'));
        this.loading.set(false);
      },
    });
  }

  onChosen(file: AdminMedia): void {
    this.picking.set(false);
    this.save(file.id, 'Das neue Titelbild ist gespeichert.');
  }

  remove(): void {
    if (!confirm('Titelbild entfernen? Die Startseite zeigt dann eine leere Fläche.')) return;
    this.save(null, 'Das Titelbild ist entfernt.');
  }

  private save(id: number | null, message: string): void {
    this.saving.set(true);
    this.error.set('');
    this.notice.set('');

    this.api.updateHome(id).subscribe({
      next: (home) => {
        this.hero.set(home.heroImage);
        this.saving.set(false);
        // Die oeffentliche API darf Antworten eine Minute zwischenspeichern.
        this.notice.set(`${message} Auf der Website ist es spätestens in einer Minute zu sehen.`);
      },
      error: (err) => {
        this.saving.set(false);
        this.error.set(apiErrorText(err, 'Das Titelbild liess sich nicht speichern.'));
      },
    });
  }
}
