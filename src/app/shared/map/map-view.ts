import { Component, computed, input, output } from '@angular/core';

import { LatLng, TILE_SIZE, project, tileUrl, unproject } from './geo';

/** Eine Kachel, wie die Vorlage sie setzt. */
interface Tile {
  key: string;
  src: string;
  /** Lage in der Kachelflaeche, in Bildpunkten. */
  left: number;
  top: number;
}

/**
 * Kacheln rund um die Mitte: zwei nach jeder Seite. Fuenf mal fuenf Kacheln
 * decken auch dann mehr als 500 Bildpunkte nach jeder Richtung ab, wenn der
 * Punkt genau auf einer Kachelkante liegt – breiter wird die Karte auf der
 * Seite nicht.
 */
const REACH = 2;

/**
 * Ein Kartenausschnitt mit Markierung.
 *
 * Setzt sich aus Kachelbildern von OpenStreetMap zusammen statt aus einem
 * eingebetteten Fremdangebot: kein iframe, kein Skript von aussen, keine
 * Bibliothek. Die Karte sieht so aus wie der Rest der Seite (Rundung,
 * Rahmen, Farbe der Markierung), und laden muss der Browser nur ein paar
 * Bilder.
 *
 * Verschieben und Zoomen gibt es hier nicht; dafuer verweist die Seite unter
 * der Karte auf OpenStreetMap. Im CMS ist die Karte `pickable`: ein Klick
 * setzt die Markierung dorthin und meldet den Punkt nach aussen.
 */
@Component({
  selector: 'app-map-view',
  standalone: true,
  templateUrl: './map-view.html',
  styleUrl: './map-view.css',
})
export class MapView {
  readonly lat = input.required<number>();
  readonly lng = input.required<number>();
  readonly zoom = input(16);
  /** Klick setzt den Punkt – nur im CMS. */
  readonly pickable = input(false);
  /** Beschreibung fuer Screenreader, z. B. die Adresse. */
  readonly label = input('Karte');

  /** Der angeklickte Punkt. */
  readonly picked = output<LatLng>();

  /** Lage des Punkts in Bildpunkten der ganzen Welt. */
  private readonly center = computed(() =>
    project({ lat: this.lat(), lng: this.lng() }, this.zoom()),
  );

  /** Linke obere Kachel des Ausschnitts. */
  private readonly origin = computed(() => ({
    x: Math.floor(this.center().x / TILE_SIZE) - REACH,
    y: Math.floor(this.center().y / TILE_SIZE) - REACH,
  }));

  readonly tiles = computed<Tile[]>(() => {
    const zoom = this.zoom();
    const count = 2 ** zoom;
    const origin = this.origin();
    const tiles: Tile[] = [];

    for (let row = 0; row <= REACH * 2; row++) {
      const y = origin.y + row;
      // Ueber dem Nordpol und unter dem Suedpol gibt es keine Kacheln.
      if (y < 0 || y >= count) continue;

      for (let column = 0; column <= REACH * 2; column++) {
        // Waagrecht wiederholt sich die Welt; links von 0 geht es bei der
        // letzten Kachel weiter.
        const x = (((origin.x + column) % count) + count) % count;
        tiles.push({
          key: `${zoom}/${origin.x + column}/${y}`,
          src: tileUrl(x, y, zoom),
          left: column * TILE_SIZE,
          top: row * TILE_SIZE,
        });
      }
    }
    return tiles;
  });

  /**
   * Verschiebung der Kachelflaeche, damit der Punkt genau in der Mitte des
   * Ausschnitts steht – unabhaengig davon, wie breit der Ausschnitt ist.
   */
  readonly offset = computed(() => ({
    x: this.center().x - this.origin().x * TILE_SIZE,
    y: this.center().y - this.origin().y * TILE_SIZE,
  }));

  /** Klick in die Karte: Abstand zur Mitte in Grad umrechnen. */
  onClick(event: MouseEvent): void {
    if (!this.pickable()) return;

    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    this.moveBy(event.clientX - (rect.left + rect.width / 2), event.clientY - (rect.top + rect.height / 2));
  }

  /**
   * Pfeiltasten verschieben die Markierung um ein Stueck, mit Umschalt um
   * ein grosses – der Weg ohne Maus, gleichwertig zum Klick.
   */
  onKey(event: KeyboardEvent): void {
    if (!this.pickable()) return;

    const step = event.shiftKey ? 60 : 12;
    const moves: Record<string, [number, number]> = {
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
    };
    const move = moves[event.key];
    if (!move) return;

    // Sonst scrollt die Seite mit.
    event.preventDefault();
    this.moveBy(move[0], move[1]);
  }

  /** Meldet den Punkt, der so viele Bildpunkte neben der Mitte liegt. */
  private moveBy(dx: number, dy: number): void {
    const center = this.center();
    const point = unproject(center.x + dx, center.y + dy, this.zoom());
    this.picked.emit({
      lat: Math.max(-85, Math.min(85, point.lat)),
      lng: point.lng,
    });
  }
}
