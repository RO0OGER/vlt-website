import { Component, computed, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

interface NavChild {
  t: string;
  d: string;
  /** Route des Eintrags. Ohne link bleibt er ein Platzhalter (Seite fehlt noch). */
  link?: string;
}

interface NavItem {
  label: string;
  desc?: string;
  children: NavChild[];
}

@Component({
  selector: 'app-header',
  imports: [RouterLink],
  templateUrl: './header.html',
  styleUrl: './header.css',
})
export class Header {
  /** Top-level navigation with hover mega-menu children. */
  readonly nav: NavItem[] = [
    {
      label: 'Engagements',
      desc: 'Kooperationen, Projekte und Standards, in denen sich vlt aktiv einbringt.',
      children: [
        { t: 'Kooperation mit ECDL', d: 'Digitale Kompetenznachweise' },
        { t: 'Kooperation mit Verlagen', d: 'Lehrmittel und Fachliteratur' },
        { t: 'SAB', d: 'Schweizerische Arbeitsgemeinschaft' },
        { t: 'BIVO 2022', d: 'Bildungsverordnung Kaufleute' },
        { t: 'QV-Prüfungen', d: 'Qualifikationsverfahren' },
        { t: 'Lehrplan 21', d: 'Begleitung der Umsetzung' },
        { t: 'Corporate Wording', d: 'Sprachliche Standards' },
      ],
    },
    {
      label: 'Im Beruf',
      desc: 'Alles rund um den Berufsalltag — Ausbildung, Weiterbildung, Stellen und Ressourcen.',
      children: [
        { t: 'Ausbildung', d: 'Grundbildung und Lehrgänge' },
        { t: 'externe Weiterbildung / Kurse', d: 'Angebote unserer Partner' },
        { t: 'Stellen', d: 'Offene Positionen im Schulwesen' },
        { t: 'Links', d: 'Nützliche Ressourcen und Verweise' },
      ],
    },
    {
      label: 'Verband organisiert',
      desc: 'Anlässe, Galerien und aktuelle Themen aus dem Verbandsleben.',
      children: [
        { t: 'Kostenübersicht', d: 'Beiträge und Tarife im Überblick' },
        { t: 'Bildergalerien', d: 'Eindrücke vergangener Anlässe' },
        { t: 'Verbandsanlässe', d: 'Jahresversammlung, Tagungen, Treffen', link: '/verbandsanlaesse' },
        { t: 'Digitaler Wandel', d: 'Schwerpunktthema des Verbands' },
        { t: 'Aktuell', d: 'Neuigkeiten und Mitteilungen' },
      ],
    },
    {
      label: 'Verband',
      desc: 'Über uns, Kommunikation und Zugang für Mitglieder.',
      children: [
        { t: 'Unser Vorstand', d: 'Köpfe und Zuständigkeiten' },
        { t: 'Pensionierte', d: 'Ehemalige Mitglieder im Netzwerk' },
        { t: 'Newsletter Anmeldung', d: 'Auf dem Laufenden bleiben' },
        { t: 'Newsletter Aktuell', d: 'Die aktuelle Ausgabe' },
        { t: 'Mitgliederbereich – Zugang', d: 'Login für Mitglieder' },
      ],
    },
    {
      label: 'Kontakt',
      desc: 'Formulare, Mutationen und administrative Anliegen rund um die Mitgliedschaft.',
      children: [
        { t: 'Anmeldung Newsletter', d: 'Auf dem Laufenden bleiben' },
        { t: 'Beitrittserklärung', d: 'Mitgliedschaft starten' },
        { t: 'Austrittserklärung', d: 'Mitgliedschaft beenden' },
        { t: 'Adressmutation Fachvorstand', d: 'Daten für Funktionsträger anpassen' },
        { t: 'Adressmutation Mitglied', d: 'Eigene Adresse aktualisieren' },
      ],
    },
  ];

  /** Desktop: index of the hovered nav item whose panel is open (null = closed). */
  readonly hover = signal<number | null>(null);
  /** Mobile: burger dropdown open state. */
  readonly mobileOpen = signal(false);
  /** Mobile: index of the expanded accordion section. */
  readonly openSection = signal<number | null>(null);

  readonly activeItem = computed(() => {
    const i = this.hover();
    return i != null ? (this.nav.at(i) ?? null) : null;
  });

  private closeTimer: ReturnType<typeof setTimeout> | undefined;

  enter(i: number): void {
    clearTimeout(this.closeTimer);
    this.hover.set(this.nav.at(i)?.children.length ? i : null);
  }

  leaveSoon(): void {
    clearTimeout(this.closeTimer);
    this.closeTimer = setTimeout(() => this.hover.set(null), 120);
  }

  cancelLeave(): void {
    clearTimeout(this.closeTimer);
  }

  toggleMobile(): void {
    this.mobileOpen.update((v) => !v);
  }

  toggleSection(i: number): void {
    if (!this.nav.at(i)?.children.length) return;
    this.openSection.update((cur) => (cur === i ? null : i));
  }
}
