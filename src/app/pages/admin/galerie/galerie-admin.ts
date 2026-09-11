import { Component, ElementRef, computed, effect, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';

import { AdminAlbumRow, AdminApi, apiErrorText } from '../../../shared/admin-api';
import { formatDateLong } from '../../../shared/dates';

/** Filter der Statusleiste. */
type StatusFilter = 'all' | 'published' | 'draft';

/**
 * Uebersicht der Bildergalerien im CMS.
 *
 * Aufgebaut wie die Beitragsuebersicht – Entwuerfe eingeschlossen, gefiltert
 * und gesucht wird im Browser. Alben sind wenige, die Liste kommt in einem
 * Stueck.
 */
@Component({
  selector: 'app-admin-galerie',
  standalone: true,
  imports: [RouterLink, FormsModule],
  templateUrl: './galerie-admin.html',
  styleUrl: './galerie-admin.css',
})
export class GalerieAdmin {
  private readonly api = inject(AdminApi);

  readonly albums = signal<AdminAlbumRow[]>([]);
  readonly loading = signal(true);
  readonly error = signal('');

  readonly confirming = signal<AdminAlbumRow | null>(null);
  readonly deleting = signal(false);

  search = '';
  private readonly term = signal('');
  readonly status = signal<StatusFilter>('all');

  private readonly panel = viewChild<ElementRef<HTMLElement>>('panel');

  readonly counts = computed(() => {
    const all = this.albums();
    return {
      all: all.length,
      published: all.filter((a) => a.status === 'published').length,
      draft: all.filter((a) => a.status === 'draft').length,
    };
  });

  readonly visible = computed(() => {
    const term = this.term().trim().toLowerCase();
    const status = this.status();

    return this.albums().filter((album) => {
      if (status !== 'all' && album.status !== status) return false;
      if (term === '') return true;
      return (
        album.title.toLowerCase().includes(term) ||
        (album.location ?? '').toLowerCase().includes(term) ||
        (album.category ?? '').toLowerCase().includes(term)
      );
    });
  });

  constructor() {
    this.load();
    effect(() => this.panel()?.nativeElement.focus());
  }

  load(): void {
    this.loading.set(true);
    this.error.set('');

    this.api.albums().subscribe({
      next: (albums) => {
        this.albums.set(albums);
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set(apiErrorText(err, 'Die Alben liessen sich nicht laden.'));
        this.loading.set(false);
      },
    });
  }

  onSearch(value: string): void {
    this.term.set(value);
  }

  setStatus(status: StatusFilter): void {
    this.status.set(status);
  }

  askDelete(album: AdminAlbumRow): void {
    this.error.set('');
    this.confirming.set(album);
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
    const album = this.confirming();
    if (!album || this.deleting()) return;

    this.deleting.set(true);
    this.api.removeAlbum(album.id).subscribe({
      next: () => {
        this.deleting.set(false);
        this.confirming.set(null);
        this.albums.update((list) => list.filter((entry) => entry.id !== album.id));
      },
      error: (err) => {
        this.deleting.set(false);
        this.confirming.set(null);
        this.error.set(apiErrorText(err, 'Das Album liess sich nicht löschen.'));
      },
    });
  }

  dateLabel(date: string): string {
    return formatDateLong(date);
  }

  imageLabel(count: number): string {
    return count === 1 ? '1 Bild' : `${count} Bilder`;
  }
}
