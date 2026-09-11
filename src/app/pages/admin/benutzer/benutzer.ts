import { Component, ElementRef, effect, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { AdminApi, AdminUser, NewUser, apiErrorText } from '../../../shared/admin-api';
import { formatDateLong } from '../../../shared/dates';

/**
 * Zugaenge zum CMS verwalten.
 *
 * Ein neuer Zugang bekommt ein gewuerfeltes Startpasswort. Das erscheint
 * genau einmal – gespeichert wird nur sein Hash, zurueckholen kann es
 * niemand. Weitergegeben wird es von Hand; beim ersten Anmelden muss der
 * neue Admin es ersetzen, das erzwingt die API.
 */
@Component({
  selector: 'app-admin-benutzer',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './benutzer.html',
  styleUrl: './benutzer.css',
})
export class Benutzer {
  private readonly api = inject(AdminApi);

  readonly users = signal<AdminUser[]>([]);
  readonly loading = signal(true);
  readonly error = signal('');

  /** Der frisch angelegte Zugang samt Startpasswort. */
  readonly created = signal<NewUser | null>(null);
  readonly creating = signal(false);
  readonly copied = signal(false);

  /** Zugang, dessen Loeschung bestaetigt werden soll. */
  readonly confirming = signal<AdminUser | null>(null);
  readonly deleting = signal(false);

  email = '';

  private readonly panel = viewChild<ElementRef<HTMLElement>>('panel');

  constructor() {
    this.load();
    effect(() => this.panel()?.nativeElement.focus());
  }

  load(): void {
    this.loading.set(true);
    this.error.set('');

    this.api.users().subscribe({
      next: (users) => {
        this.users.set(users);
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set(apiErrorText(err, 'Die Zugänge liessen sich nicht laden.'));
        this.loading.set(false);
      },
    });
  }

  // ── Anlegen ────────────────────────────────────────────────

  create(): void {
    const email = this.email.trim();
    if (email === '' || this.creating()) return;

    this.error.set('');
    this.creating.set(true);

    this.api.createUser(email).subscribe({
      next: (user) => {
        this.creating.set(false);
        this.email = '';
        this.copied.set(false);
        this.created.set(user);
        // Die Liste neu holen statt sie zu ergaenzen: die API entscheidet,
        // welcher Zugang geschuetzt ist und welcher der eigene.
        this.load();
      },
      error: (err) => {
        this.creating.set(false);
        this.error.set(apiErrorText(err, 'Der Zugang liess sich nicht anlegen.'));
      },
    });
  }

  /** Legt das Startpasswort in die Zwischenablage. */
  copyPassword(): void {
    const user = this.created();
    if (!user) return;

    // Die Zwischenablage darf der Browser verweigern (kein HTTPS, keine
    // Erlaubnis). Dann bleibt das Passwort sichtbar und kann von Hand
    // markiert werden – deshalb hier kein Fehler, nur kein Haken.
    navigator.clipboard?.writeText(user.password).then(
      () => this.copied.set(true),
      () => this.copied.set(false),
    );
  }

  dismissPassword(): void {
    this.created.set(null);
    this.copied.set(false);
  }

  // ── Löschen ────────────────────────────────────────────────

  askDelete(user: AdminUser): void {
    this.error.set('');
    this.confirming.set(user);
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
    const user = this.confirming();
    if (!user || this.deleting()) return;

    this.deleting.set(true);
    this.api.removeUser(user.id).subscribe({
      next: () => {
        this.deleting.set(false);
        this.confirming.set(null);
        this.users.update((list) => list.filter((entry) => entry.id !== user.id));
      },
      error: (err) => {
        this.deleting.set(false);
        this.confirming.set(null);
        this.error.set(apiErrorText(err, 'Der Zugang liess sich nicht löschen.'));
      },
    });
  }

  dateLabel(value: string): string {
    // created_at ist ein Zeitstempel; fuer die Anzeige genuegt der Tag.
    return formatDateLong(value.slice(0, 10));
  }
}
