import { Component, HostListener, computed, signal } from '@angular/core';

import {
  ALL_ALBUM_CATEGORIES,
  GalleryAlbum,
  albumCategories,
  formatAlbumDate,
  sortedAlbums,
} from './gallery-data';

/** Ein Album, aufbereitet fuer eine Karte der Galerie. */
interface AlbumCard extends GalleryAlbum {
  /** Ausgeschriebenes Datum – die Karte formatiert selbst nichts. */
  dateLabel: string;
}

/** Offener Zustand der Lightbox: welches Album, welches Bild. */
interface Lightbox {
  album: AlbumCard;
  index: number;
}

@Component({
  selector: 'app-galerie',
  imports: [],
  templateUrl: './galerie.html',
  styleUrl: './galerie.css',
})
export class Galerie {
  readonly allCategories = ALL_ALBUM_CATEGORIES;

  /** Neuste zuerst – die Reihenfolge aendert sich beim Filtern nicht. */
  private readonly albums: AlbumCard[] = sortedAlbums().map((a) => ({
    ...a,
    dateLabel: formatAlbumDate(a.date),
  }));

  readonly categories = albumCategories(this.albums);
  readonly category = signal(ALL_ALBUM_CATEGORIES);

  readonly filtered = computed<AlbumCard[]>(() => {
    const cat = this.category();
    return this.albums.filter((a) => cat === ALL_ALBUM_CATEGORIES || a.cat === cat);
  });

  /** "1 Album" statt "1 Alben". */
  readonly countLabel = computed(() => {
    const n = this.filtered().length;
    return `${n} ${n === 1 ? 'Album' : 'Alben'}`;
  });

  /** null = Lightbox geschlossen. */
  readonly lightbox = signal<Lightbox | null>(null);

  /** Das gerade in der Lightbox gezeigte Bild. */
  readonly currentImage = computed(() => {
    const lb = this.lightbox();
    return lb ? lb.album.images.at(lb.index) ?? null : null;
  });

  open(album: AlbumCard, index = 0): void {
    this.lightbox.set({ album, index });
  }

  close(): void {
    this.lightbox.set(null);
  }

  /** Blaettert zyklisch – nach dem letzten Bild kommt wieder das erste. */
  step(delta: number): void {
    this.lightbox.update((lb) => {
      if (!lb) return lb;
      const n = lb.album.images.length;
      return { ...lb, index: (lb.index + delta + n) % n };
    });
  }

  /** Tastatursteuerung, nur wenn die Lightbox offen ist. */
  @HostListener('document:keydown', ['$event'])
  onKeydown(e: KeyboardEvent): void {
    if (!this.lightbox()) return;
    switch (e.key) {
      case 'Escape':
        this.close();
        break;
      case 'ArrowRight':
        e.preventDefault();
        this.step(1);
        break;
      case 'ArrowLeft':
        e.preventDefault();
        this.step(-1);
        break;
    }
  }
}
