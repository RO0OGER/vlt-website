import { AdminBlock, AdminMedia } from './admin-api';

/**
 * Die Bausteine, aus denen ein Beitrag zusammengesetzt wird.
 *
 * Ein Beitrag ist im Editor eine Liste von Bloecken, in der Datenbank eine
 * Liste von Abschnitten (post_sections). Ein Abschnitt traegt immer einen
 * Text und – je nach Art – null bis zwei Bilder, eine Adresse, eine Tabelle,
 * eine Liste von Dokumenten oder einen Standort auf der Karte. Diese Datei
 * ist die einzige Stelle, die beide Seiten kennt: welche Arten es gibt, was
 * eine Art traegt und wie ein Block zur Speicherform wird.
 *
 * Events (eigene Tabellen seit Migration 008) bestehen aus denselben
 * Bausteinen wie Beitraege, ausser der Karte: ihr Ort steht in den
 * Eckdaten, und die Website fuehrt mit "Route planen" hin.
 *
 * Kommt eine Art dazu, ist hier, in den ENUM-Spalten `post_sections.kind`
 * (Migrationen 003, 005 und 006) und `event_sections.kind` (008) und in
 * BLOCK_KINDS in api/admin.php etwas zu tun – sonst nirgends.
 */

export type BlockKind =
  | 'text'
  | 'heading'
  | 'quote'
  | 'image'
  | 'gallery'
  | 'table'
  | 'document'
  | 'link'
  | 'map';

/**
 * Was ein Baustein neben Text und Bildern noch traegt.
 *
 * Jede Art hat hoechstens eine Beigabe – daher ein Wert und nicht drei
 * Schalter. Der Editor liest ihn, um zu wissen, welche Felder er zeigt; die
 * Umformung weiter unten, um zu wissen, was sie mitschicken muss.
 */
export type BlockPayload = 'none' | 'url' | 'table' | 'documents' | 'location';

/** Beschreibung einer Art fuer die Bausteinleiste und den Editor. */
export interface BlockType {
  kind: BlockKind;
  /** Name in der Bausteinleiste. */
  label: string;
  /** Ein Satz, der sagt, wofuer der Baustein gut ist. */
  hint: string;
  /** Wie viele Bilder der Baustein traegt. */
  images: 0 | 1 | 2;
  /** Was der Baustein ausserdem traegt. */
  payload: BlockPayload;
  /** Text im leeren Eingabefeld. */
  placeholder: string;
  /** Mehrzeiliges Feld? Ein Zwischentitel ist immer einzeilig. */
  multiline: boolean;
}

/**
 * Reihenfolge in der Bausteinleiste: das Haeufigste zuoberst. Fliesstext
 * und Bild machen zusammen den Grossteil jedes Beitrags aus.
 */
export const BLOCK_TYPES: readonly BlockType[] = [
  {
    kind: 'text',
    label: 'Text',
    hint: 'Fliesstext, ein Absatz.',
    images: 0,
    payload: 'none',
    placeholder: 'Text des Absatzes …',
    multiline: true,
  },
  {
    kind: 'heading',
    label: 'Zwischentitel',
    hint: 'Gliedert lange Beiträge.',
    images: 0,
    payload: 'none',
    placeholder: 'Zwischentitel …',
    multiline: false,
  },
  {
    kind: 'image',
    label: 'Bild',
    hint: 'Ein Bild über die ganze Breite.',
    images: 1,
    payload: 'none',
    placeholder: 'Bildlegende (optional) …',
    multiline: false,
  },
  {
    kind: 'gallery',
    label: 'Bildpaar',
    hint: 'Zwei Bilder nebeneinander.',
    images: 2,
    payload: 'none',
    placeholder: 'Bildlegende (optional) …',
    multiline: false,
  },
  {
    kind: 'table',
    label: 'Tabelle',
    hint: 'Zeilen und Spalten, z. B. Termine.',
    images: 0,
    payload: 'table',
    placeholder: 'Beschriftung (optional) …',
    multiline: false,
  },
  {
    kind: 'document',
    label: 'Dokumente',
    hint: 'Dateien zum Herunterladen.',
    images: 0,
    payload: 'documents',
    placeholder: 'Überschrift der Liste (optional) …',
    multiline: false,
  },
  {
    kind: 'link',
    label: 'Link',
    hint: 'Ein Verweis; angezeigt wird der Titel.',
    images: 0,
    payload: 'url',
    placeholder: 'Titel des Links …',
    multiline: false,
  },
  {
    kind: 'map',
    label: 'Karte',
    hint: 'Standort mit Kartenausschnitt.',
    images: 0,
    payload: 'location',
    placeholder: 'Adresse, z. B. «Lüssiweg 24, 6300 Zug» …',
    multiline: false,
  },
  {
    kind: 'quote',
    label: 'Zitat',
    hint: 'Hervorgehobene Aussage.',
    images: 0,
    payload: 'none',
    placeholder: 'Zitat …',
    multiline: true,
  },
];

/** Nachschlagen einer Art. Unbekannte Arten fallen auf Fliesstext zurueck. */
export function blockType(kind: BlockKind): BlockType {
  return BLOCK_TYPES.find((type) => type.kind === kind) ?? BLOCK_TYPES[0];
}

// ── Tabelle ─────────────────────────────────────────────────

/**
 * Die Tabelle eines Tabellen-Bausteins.
 *
 * Immer rechteckig: alle Zeilen sind gleich lang. Die Funktionen weiter
 * unten halten das ein, und die API bringt eine krumme Tabelle beim Lesen
 * wieder in Form.
 */
export interface TableData {
  /** Erste Zeile als Kopfzeile darstellen. */
  head: boolean;
  /** Zeilen von oben nach unten; bei `head` ist rows[0] die Kopfzeile. */
  rows: string[][];
}

/**
 * Grenzen, die auch die API kennt (TABLE_MAX_* in api/admin.php).
 *
 * Eine Tabelle mit mehr als zehn Spalten ist auf dem Telefon nicht mehr
 * lesbar, und eine mit sechzig Zeilen gehoert als Datei in einen
 * Dokument-Baustein.
 */
export const TABLE_MAX_ROWS = 60;
export const TABLE_MAX_COLUMNS = 10;

/** Eine neue Tabelle: Kopfzeile und zwei Zeilen zu drei Spalten. */
export function createTable(): TableData {
  return { head: true, rows: [emptyRow(3), emptyRow(3), emptyRow(3)] };
}

function emptyRow(length: number): string[] {
  return Array.from({ length }, () => '');
}

/** Spaltenzahl – die Zeilen sind alle gleich lang, also genuegt die erste. */
export function tableColumns(table: TableData): number {
  return table.rows[0]?.length ?? 0;
}

/** Setzt eine Zelle. Neues Objekt, damit die Anzeige die Aenderung sieht. */
export function setTableCell(table: TableData, row: number, column: number, value: string): TableData {
  return {
    ...table,
    rows: table.rows.map((cells, index) =>
      index === row ? cells.map((cell, position) => (position === column ? value : cell)) : cells,
    ),
  };
}

/** Haengt eine leere Zeile an. Mehr als TABLE_MAX_ROWS gibt es nicht. */
export function addTableRow(table: TableData): TableData {
  if (table.rows.length >= TABLE_MAX_ROWS) return table;
  return { ...table, rows: [...table.rows, emptyRow(tableColumns(table))] };
}

/**
 * Entfernt eine Zeile. Die letzte bleibt stehen: eine Tabelle ohne Zeilen
 * waere ein leerer Baustein, den die API abweist – und der Redaktor haette
 * keine Stelle mehr, an der er wieder anfangen koennte.
 */
export function removeTableRow(table: TableData, row: number): TableData {
  if (table.rows.length <= 1) return table;
  return { ...table, rows: table.rows.filter((_, index) => index !== row) };
}

/** Haengt eine leere Spalte an. */
export function addTableColumn(table: TableData): TableData {
  if (tableColumns(table) >= TABLE_MAX_COLUMNS) return table;
  return { ...table, rows: table.rows.map((cells) => [...cells, '']) };
}

/** Entfernt eine Spalte. Die letzte bleibt stehen, wie bei den Zeilen. */
export function removeTableColumn(table: TableData, column: number): TableData {
  if (tableColumns(table) <= 1) return table;
  return { ...table, rows: table.rows.map((cells) => cells.filter((_, index) => index !== column)) };
}

/** Steht in irgendeiner Zelle etwas? */
export function tableHasContent(table: TableData): boolean {
  return table.rows.some((cells) => cells.some((cell) => cell.trim() !== ''));
}

// ── Dokumente ───────────────────────────────────────────────

/**
 * Eine Datei in einem Dokument-Baustein.
 *
 * Beschriftung und Datei stehen getrennt: die Datei gehoert zum Bestand,
 * die Beschriftung zu diesem Baustein. Dieselbe Datei kann in einem anderen
 * Beitrag darum anders heissen.
 */
export interface EditorDocument {
  /** Laufende Nummer, nur im Browser – wie EditorBlock.uid. */
  uid: number;
  label: string;
  file: AdminMedia;
}

/** Dateien je Dokument-Baustein; dieselbe Grenze kennt die API. */
export const BLOCK_MAX_DOCUMENTS = 20;

// ── Karte ───────────────────────────────────────────────────

/**
 * Der Standort eines Karten-Bausteins: ein Punkt und die Zoomstufe, mit der
 * die Karte ihn zeigt. Die Adresse dazu steht im Text des Bausteins.
 */
export interface MapLocation {
  lat: number;
  lng: number;
  zoom: number;
}

/**
 * Zoomstufen, die die Karte zulaesst – dieselben Grenzen kennt die API
 * (MAP_ZOOM_* in api/admin.php). 16 zeigt ein paar Strassenzuege: genug, um
 * ein Schulhaus zu finden, und nah genug, um es zu erkennen.
 */
export const MAP_ZOOM_MIN = 3;
export const MAP_ZOOM_MAX = 19;
export const MAP_ZOOM_DEFAULT = 16;

// ── Block ───────────────────────────────────────────────────

/**
 * Ein Block im Editor.
 *
 * `uid` ist eine laufende Nummer, die nur im Browser lebt: Angular braucht
 * fuer `@for` einen stabilen Schluessel, sonst baut es beim Umsortieren die
 * Eingabefelder neu auf – und der Cursor springt mitten im Tippen weg. Die
 * Position im Array ist dafuer untauglich, sie aendert sich ja gerade.
 *
 * Die Felder der Beigaben sind immer gesetzt, auch wenn die Art sie nicht
 * braucht. Ein Wechsel auf eine andere Art kommt im Editor nicht vor, und
 * leere Vorgaben ersparen jeder Stelle, die einen Block anfasst, die Frage
 * ob das Feld schon da ist.
 */
export interface EditorBlock {
  uid: number;
  kind: BlockKind;
  text: string;
  /** So lang, wie die Art Bilder traegt. Ein leerer Platz ist null. */
  images: (AdminMedia | null)[];
  /** Ziel des Link-Bausteins; bei allen anderen Arten leer. */
  url: string;
  /** Inhalt des Tabellen-Bausteins; bei allen anderen Arten leer. */
  table: TableData;
  /** Dateien des Dokument-Bausteins; bei allen anderen Arten leer. */
  documents: EditorDocument[];
  /** Standort des Karten-Bausteins; null, solange keiner gesetzt ist. */
  location: MapLocation | null;
}

let nextUid = 1;

/** Legt einen leeren Block der gewuenschten Art an. */
export function createBlock(kind: BlockKind): EditorBlock {
  const type = blockType(kind);
  return {
    uid: nextUid++,
    kind,
    text: '',
    images: Array.from({ length: type.images }, () => null),
    url: '',
    // Eine Tabelle startet mit einem Raster, damit sofort Zellen dastehen,
    // in die man tippen kann. Andere Arten tragen eine leere.
    table: type.payload === 'table' ? createTable() : { head: false, rows: [] },
    documents: [],
    location: null,
  };
}

/** Legt einen Eintrag fuer eine gewaehlte Datei an. */
export function createDocument(file: AdminMedia): EditorDocument {
  return {
    uid: nextUid++,
    // Die Bezeichnung aus dem Bestand als Vorschlag: meistens passt sie
    // schon, und sonst steht sie zum Ueberschreiben da.
    label: file.alt,
    file,
  };
}

/** Wandelt die Bloecke aus der API in die Form des Editors. */
export function toEditorBlocks(blocks: AdminBlock[]): EditorBlock[] {
  return blocks.map((block) => {
    const type = blockType(block.kind);
    return {
      uid: nextUid++,
      kind: block.kind,
      text: block.text,
      // Auf die Zahl der Plaetze bringen: fehlende Bilder werden zu leeren
      // Plaetzen, ueberzaehlige fallen weg. So passt die Anzeige immer zur
      // Art, auch wenn in der Datenbank einmal etwas anderes steht.
      images: Array.from({ length: type.images }, (_, i) => block.images[i] ?? null),
      url: block.url ?? '',
      // Eine Tabellenzeile ohne Tabelle kann nur aus einem Eingriff von Hand
      // kommen. Dann ist ein leeres Raster besser als ein Baustein, in dem
      // man nichts anfassen kann.
      table: block.table ?? (type.payload === 'table' ? createTable() : { head: false, rows: [] }),
      documents: block.documents.map((document) => ({
        uid: nextUid++,
        label: document.label,
        file: document.file,
      })),
      location: type.payload === 'location' ? (block.location ?? null) : null,
    };
  });
}

/** Ein Block in der Form, die die API erwartet. */
export interface PayloadBlock {
  kind: BlockKind;
  text: string;
  imageIds: number[];
  url: string;
  table: TableData | null;
  documents: { mediaId: number; label: string }[];
  location: MapLocation | null;
}

/** Bringt die Bloecke in die Form, die die API erwartet. */
export function toPayloadBlocks(blocks: EditorBlock[]): PayloadBlock[] {
  return blocks.map((block) => {
    const payload = blockType(block.kind).payload;
    return {
      kind: block.kind,
      text: block.text.trim(),
      imageIds: block.images.filter((image): image is AdminMedia => image !== null).map((image) => image.id),
      // Nur schicken, was zur Art gehoert. Die API liest ohnehin nichts
      // anderes, aber so steht in der Anfrage auch nichts Ueberzaehliges.
      url: payload === 'url' ? block.url.trim() : '',
      table: payload === 'table' ? block.table : null,
      documents:
        payload === 'documents'
          ? block.documents.map((document) => ({
              mediaId: document.file.id,
              label: document.label.trim(),
            }))
          : [],
      location: payload === 'location' ? block.location : null,
    };
  });
}

/**
 * Ein Block ist leer, wenn nichts drinsteht, was ihn tragen koennte. Was das
 * ist, haengt von der Art ab: beim Link die Adresse (ohne Titel steht spaeter
 * die Adresse selbst da), bei der Tabelle eine gefuellte Zelle, beim
 * Dokument-Baustein eine Datei, bei der Karte ein Standort, sonst Text oder
 * Bild.
 *
 * Die API weist leere Bloecke ab; hier faellt das schon vor dem Speichern
 * auf, und der Editor kann die Stelle markieren statt nur eine Fehlermeldung
 * zu zeigen.
 */
export function isEmptyBlock(block: EditorBlock): boolean {
  switch (blockType(block.kind).payload) {
    case 'url':
      return block.url.trim() === '';
    case 'table':
      return !tableHasContent(block.table);
    case 'documents':
      return block.documents.length === 0;
    case 'location':
      return block.location === null;
    default:
      return block.text.trim() === '' && block.images.every((image) => image === null);
  }
}

/** Kurzfassung des Inhalts fuer die zusammengeklappte Ansicht. */
export function blockSummary(block: EditorBlock): string {
  switch (blockType(block.kind).payload) {
    case 'url':
      return block.text.trim() || block.url.trim() || 'Noch leer';
    case 'table': {
      const rows = block.table.rows.length;
      const columns = tableColumns(block.table);
      return `${rows} ${rows === 1 ? 'Zeile' : 'Zeilen'} × ${columns} ${columns === 1 ? 'Spalte' : 'Spalten'}`;
    }
    case 'documents': {
      const count = block.documents.length;
      if (count === 0) return 'Noch leer';
      return count === 1 ? '1 Dokument' : `${count} Dokumente`;
    }
    case 'location':
      if (block.location === null) return 'Noch kein Standort';
      return block.text.trim() || 'Standort gesetzt';
    default: {
      const text = block.text.trim();
      if (text !== '') {
        return text.length > 80 ? `${text.slice(0, 80)}…` : text;
      }
      const count = block.images.filter((image) => image !== null).length;
      if (count > 0) {
        return count === 1 ? '1 Bild' : `${count} Bilder`;
      }
      return 'Noch leer';
    }
  }
}

/** Adresse aus einem Titel: Kleinbuchstaben, Ziffern, Bindestriche. */
export function slugify(text: string): string {
  const umlauts: Record<string, string> = { ä: 'ae', ö: 'oe', ü: 'ue', ß: 'ss' };

  return text
    .toLowerCase()
    .replace(/[äöüß]/g, (char) => umlauts[char] ?? char)
    // Akzente abtrennen und wegwerfen, damit aus "café" nicht "caf" wird.
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 190);
}
