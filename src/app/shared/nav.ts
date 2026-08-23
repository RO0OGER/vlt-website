/**
 * Die Navigation des Auftritts.
 *
 * Kopf- und Fusszeile zeigen dieselben Ziele, nur anders angeordnet: oben als
 * Mega-Menü beim Überfahren, unten als Spalten zum Blättern. Beide lesen aus
 * dieser Liste – sonst gäbe es zwei Stände, die früher oder später
 * auseinanderlaufen.
 *
 * Jeder Eintrag führt auf eine Route. Punkte ohne Ziel gehören nicht hierher:
 * ein Menüeintrag, der nichts tut, ist für Besucher eine Sackgasse.
 */

export interface NavChild {
  t: string;
  d: string;
  /** Route des Eintrags. */
  link: string;
}

export interface NavItem {
  label: string;
  /** Route, falls der Punkt direkt auf eine Seite führt statt ein Menü zu öffnen. */
  link?: string;
  children: NavChild[];
}

export const NAV: NavItem[] = [
  {
    label: 'Engagements',
    children: [
      { t: 'Kooperation mit ECDL', d: 'Digitale Kompetenznachweise', link: '/ecdl-kooperation' },
      { t: 'Kooperation mit Verlagen', d: 'Lehrmittel und Fachliteratur', link: '/verlag-kooperation' },
      { t: 'SAB', d: 'Schweizerische Arbeitsgemeinschaft', link: '/sab' },
      { t: 'BIVO 2022', d: 'Bildungsverordnung Kaufleute', link: '/bivo-2022' },
      { t: 'QV-Prüfungen', d: 'Qualifikationsverfahren', link: '/qv-pruefungen' },
      { t: 'Lehrplan 21', d: 'Begleitung der Umsetzung', link: '/lehrplan-21' },
      { t: 'Corporate Wording', d: 'Sprachliche Standards', link: '/corporate-wording' },
    ],
  },
  {
    label: 'Im Beruf',
    children: [
      { t: 'Ausbildung', d: 'Grundbildung und Lehrgänge', link: '/ausbildung' },
      { t: 'Stellen', d: 'Offene Positionen im Schulwesen', link: '/stellen' },
      { t: 'Links', d: 'Nützliche Ressourcen und Verweise', link: '/links' },
    ],
  },
  {
    label: 'Verband organisiert',
    children: [
      { t: 'Verbandsanlässe', d: 'Anlässe und Kurse des Verbands', link: '/verbandsanlaesse' },
      { t: 'Kostenübersicht', d: 'Beiträge und Tarife im Überblick', link: '/teilnehmerkosten' },
      { t: 'Bildergalerien', d: 'Eindrücke vergangener Anlässe', link: '/galerie' },
      { t: 'Beiträge', d: 'Neuigkeiten und Mitteilungen', link: '/beitraege' },
    ],
  },
  {
    label: 'Verband',
    children: [
      { t: 'Unser Vorstand', d: 'Personen und Zuständigkeiten', link: '/vorstand' },
    ],
  },
  {
    // Ohne Untereinträge: der Punkt führt direkt auf die Seite.
    label: 'Kontakt',
    link: '/kontakt',
    children: [],
  },
];
