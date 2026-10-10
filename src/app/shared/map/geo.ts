import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

/**
 * Rechnen mit Kartenkacheln und Suchen von Adressen.
 *
 * Die Karte der Seite ist kein eingebettetes Fremdangebot (kein iframe,
 * keine Kartenbibliothek), sondern eine Handvoll Kachelbilder von
 * OpenStreetMap, die MapView selbst zusammensetzt. Dafuer braucht es die
 * Umrechnung zwischen Grad und Bildpunkten – die Web-Mercator-Projektion,
 * mit der alle gaengigen Kartendienste arbeiten. Sie steht hier, damit die
 * Komponente nur noch zeichnet.
 */

/** Kantenlaenge einer Kachel in Bildpunkten. */
export const TILE_SIZE = 256;

/** Ein Punkt in Grad. */
export interface LatLng {
  lat: number;
  lng: number;
}

/** Breite der ganzen Welt in Bildpunkten bei dieser Zoomstufe. */
function worldSize(zoom: number): number {
  return TILE_SIZE * 2 ** zoom;
}

/** Grad → Bildpunkte, gemessen von der linken oberen Ecke der Welt. */
export function project(point: LatLng, zoom: number): { x: number; y: number } {
  const size = worldSize(zoom);
  const sin = Math.sin((point.lat * Math.PI) / 180);
  return {
    x: ((point.lng + 180) / 360) * size,
    y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * size,
  };
}

/** Bildpunkte → Grad. Die Umkehrung von project(). */
export function unproject(x: number, y: number, zoom: number): LatLng {
  const size = worldSize(zoom);
  const n = Math.PI - (2 * Math.PI * y) / size;
  return {
    lat: (180 / Math.PI) * Math.atan(Math.sinh(n)),
    // In den Bereich -180 … 180 holen: wer ueber die Datumsgrenze klickt,
    // landet sonst bei 190 Grad, und das weist die API ab.
    lng: ((((x / size) * 360) % 360) + 360) % 360 - 180,
  };
}

/**
 * Adresse einer Kachel bei OpenStreetMap.
 *
 * Die Nutzungsregeln erlauben das fuer eine Seite dieser Groesse, verlangen
 * aber den Hinweis auf die Urheber – den setzt MapView in die Ecke.
 */
export function tileUrl(x: number, y: number, zoom: number): string {
  return `https://tile.openstreetmap.org/${zoom}/${x}/${y}.png`;
}

/** Derselbe Ort bei OpenStreetMap, zum Vergroessern und Verschieben. */
export function openStreetMapUrl(point: LatLng, zoom: number): string {
  const lat = point.lat.toFixed(5);
  const lng = point.lng.toFixed(5);
  return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=${zoom}/${lat}/${lng}`;
}

/**
 * Wegbeschreibung zu diesem Ort.
 *
 * Google Maps, weil es auf praktisch jedem Telefon die Navigation oeffnet –
 * die Adresse dafuer ist dokumentiert und braucht keinen Schluessel.
 */
export function directionsUrl(point: LatLng): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${point.lat.toFixed(6)},${point.lng.toFixed(6)}`;
}

/**
 * Wegbeschreibung zu einer ausgeschriebenen Adresse statt zu Koordinaten.
 *
 * Fuer Events: sie haben keinen Plan mehr, nur Ort, Strasse und PLZ/Ort.
 * Google Maps sucht die Adresse selbst – genauso zuverlaessig wie ein
 * gesetzter Punkt, solange die Adresse stimmt.
 */
export function directionsToAddress(address: string): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`;
}

// ── Adresssuche ─────────────────────────────────────────────

/** Ein Treffer der Adresssuche. */
export interface GeoResult extends LatLng {
  /** Ausgeschriebene Adresse, wie der Dienst sie liefert – fuer die Trefferliste. */
  label: string;
  /**
   * Dieselbe Adresse so, wie man sie auf ein Plakat schreibt:
   * "Kantonsschule Zug, Lüssiweg 24, 6300 Zug".
   */
  short: string;
}

/** Antwort von Nominatim – nur die Felder, die hier gebraucht werden. */
interface NominatimHit {
  lat: string;
  lon: string;
  display_name: string;
  name?: string;
  address?: Record<string, string | undefined>;
}

/**
 * Kurzform einer Adresse aus den Einzelteilen.
 *
 * display_name ist die ganze Kette bis zum Land, in der Reihenfolge des
 * Datenbestands ("24, Lüssiweg, Guthirt, Zug, 6300, Schweiz/Suisse/…").
 * Gebraucht wird Name, Strasse mit Nummer, Postleitzahl mit Ort. Fehlt das
 * alles, bleibt der Anfang der langen Fassung.
 */
function shortAddress(hit: NominatimHit): string {
  const a = hit.address ?? {};
  const street = [a['road'] ?? a['pedestrian'] ?? a['footway'], a['house_number']].filter(Boolean).join(' ');
  const place = [a['postcode'], a['city'] ?? a['town'] ?? a['village'] ?? a['municipality']]
    .filter(Boolean)
    .join(' ');

  // Der Name nur, wenn er nicht bloss die Strasse wiederholt – bei einer
  // reinen Adresse liefert Nominatim dort den Strassennamen.
  const name = hit.name && hit.name !== a['road'] ? hit.name : '';

  const parts = [name, street, place].filter((part) => part !== '');
  return parts.length > 0 ? parts.join(', ') : hit.display_name.split(',').slice(0, 3).join(',').trim();
}

/**
 * Sucht Adressen bei Nominatim, dem Suchdienst von OpenStreetMap.
 *
 * Nur im CMS: der Redaktor tippt eine Adresse, waehlt einen Treffer und
 * setzt damit den Punkt. Besucher der Seite loesen nie eine Suche aus – die
 * Koordinaten stehen dann schon in der Datenbank. Damit bleibt die Last
 * weit unter dem, was Nominatim kostenlos zulaesst (eine Anfrage je
 * Sekunde), und die Seite haengt beim Anzeigen nicht an einem fremden
 * Dienst.
 */
@Injectable({ providedIn: 'root' })
export class Geocoder {
  private readonly http = inject(HttpClient);

  search(query: string): Observable<GeoResult[]> {
    const params = new HttpParams()
      .set('q', query)
      .set('format', 'jsonv2')
      .set('limit', 5)
      // Der Verband ist in der Schweiz zuhause. Die Nachbarlaender bleiben
      // drin, falls ein Anlass einmal ennet der Grenze stattfindet.
      .set('countrycodes', 'ch,li,de,at,fr,it')
      .set('accept-language', 'de')
      // Einzelteile der Adresse, damit sich daraus die Kurzform bauen laesst.
      .set('addressdetails', 1);

    return this.http
      .get<NominatimHit[]>('https://nominatim.openstreetmap.org/search', { params })
      .pipe(
        map((hits) =>
          hits
            .map((hit) => ({
              lat: Number(hit.lat),
              lng: Number(hit.lon),
              label: hit.display_name,
              short: shortAddress(hit),
            }))
            .filter((hit) => Number.isFinite(hit.lat) && Number.isFinite(hit.lng)),
        ),
      );
  }
}
