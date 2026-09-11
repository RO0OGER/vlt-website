import { AdminBlock, AdminMedia } from './admin-api';

/**
 * Die Bausteine, aus denen ein Beitrag zusammengesetzt wird.
 *
 * Ein Beitrag ist im Editor eine Liste von Bloecken, in der Datenbank eine
 * Liste von Abschnitten (post_sections) mit Art, Text und null bis zwei
 * Bildern. Diese Datei ist die einzige Stelle, die beide Seiten kennt:
 * welche Arten es gibt, wie viele Bilder eine Art traegt und wie ein Block
 * zur Speicherform wird.
 *
 * Kommt eine Art dazu, ist hier und in der ENUM-Spalte `post_sections.kind`
 * (Migration 003) etwas zu tun – sonst nirgends.
 */

export type BlockKind = 'text' | 'heading' | 'quote' | 'image' | 'gallery';

/** Beschreibung einer Art fuer die Bausteinleiste und den Editor. */
export interface BlockType {
  kind: BlockKind;
  /** Name in der Bausteinleiste. */
  label: string;
  /** Ein Satz, der sagt, wofuer der Baustein gut ist. */
  hint: string;
  /** Wie viele Bilder der Baustein traegt. */
  images: 0 | 1 | 2;
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
    placeholder: 'Text des Absatzes …',
    multiline: true,
  },
  {
    kind: 'heading',
    label: 'Zwischentitel',
    hint: 'Gliedert lange Beiträge.',
    images: 0,
    placeholder: 'Zwischentitel …',
    multiline: false,
  },
  {
    kind: 'image',
    label: 'Bild',
    hint: 'Ein Bild über die ganze Breite.',
    images: 1,
    placeholder: 'Bildlegende (optional) …',
    multiline: false,
  },
  {
    kind: 'gallery',
    label: 'Bildpaar',
    hint: 'Zwei Bilder nebeneinander.',
    images: 2,
    placeholder: 'Bildlegende (optional) …',
    multiline: false,
  },
  {
    kind: 'quote',
    label: 'Zitat',
    hint: 'Hervorgehobene Aussage.',
    images: 0,
    placeholder: 'Zitat …',
    multiline: true,
  },
];

/** Nachschlagen einer Art. Unbekannte Arten fallen auf Fliesstext zurueck. */
export function blockType(kind: BlockKind): BlockType {
  return BLOCK_TYPES.find((type) => type.kind === kind) ?? BLOCK_TYPES[0];
}

/**
 * Ein Block im Editor.
 *
 * `uid` ist eine laufende Nummer, die nur im Browser lebt: Angular braucht
 * fuer `@for` einen stabilen Schluessel, sonst baut es beim Umsortieren die
 * Eingabefelder neu auf – und der Cursor springt mitten im Tippen weg. Die
 * Position im Array ist dafuer untauglich, sie aendert sich ja gerade.
 */
export interface EditorBlock {
  uid: number;
  kind: BlockKind;
  text: string;
  /** So lang, wie die Art Bilder traegt. Ein leerer Platz ist null. */
  images: (AdminMedia | null)[];
}

let nextUid = 1;

/** Legt einen leeren Block der gewuenschten Art an. */
export function createBlock(kind: BlockKind): EditorBlock {
  return {
    uid: nextUid++,
    kind,
    text: '',
    images: Array.from({ length: blockType(kind).images }, () => null),
  };
}

/** Wandelt die Bloecke aus der API in die Form des Editors. */
export function toEditorBlocks(blocks: AdminBlock[]): EditorBlock[] {
  return blocks.map((block) => {
    const slots = blockType(block.kind).images;
    return {
      uid: nextUid++,
      kind: block.kind,
      text: block.text,
      // Auf die Zahl der Plaetze bringen: fehlende Bilder werden zu leeren
      // Plaetzen, ueberzaehlige fallen weg. So passt die Anzeige immer zur
      // Art, auch wenn in der Datenbank einmal etwas anderes steht.
      images: Array.from({ length: slots }, (_, i) => block.images[i] ?? null),
    };
  });
}

/** Bringt die Bloecke in die Form, die die API erwartet. */
export function toPayloadBlocks(blocks: EditorBlock[]): { kind: BlockKind; text: string; imageIds: number[] }[] {
  return blocks.map((block) => ({
    kind: block.kind,
    text: block.text.trim(),
    imageIds: block.images.filter((image): image is AdminMedia => image !== null).map((image) => image.id),
  }));
}

/**
 * Ein Block ist leer, wenn weder Text noch Bild drin steht. Die API weist
 * solche Bloecke ab; hier faellt das schon vor dem Speichern auf, und der
 * Editor kann die Stelle markieren statt nur eine Fehlermeldung zu zeigen.
 */
export function isEmptyBlock(block: EditorBlock): boolean {
  return block.text.trim() === '' && block.images.every((image) => image === null);
}

/** Kurzfassung des Inhalts fuer die zusammengeklappte Ansicht. */
export function blockSummary(block: EditorBlock): string {
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
