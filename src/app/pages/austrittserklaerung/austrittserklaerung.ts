import { Component, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

/** Status, den ein Mitglied heute hat. */
export type BisherigerStatus =
  | 'Aktivmitglied'
  | 'Passivmitglied'
  | 'Freimitglied'
  | 'Ehrenmitglied';

/** Status, den es kuenftig haben soll – inklusive Austritt. */
export type NeuerStatus =
  | 'Austritt aus Verband'
  | 'Aktivmitglied'
  | 'Passivmitglied';

/**
 * Grobpruefung einer E-Mail-Adresse: etwas, ein @, etwas, ein Punkt, etwas.
 * Faengt Tippfehler ab, bevor die Bestaetigung ins Leere geht.
 */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

@Component({
  selector: 'app-austrittserklaerung',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './austrittserklaerung.html',
  styleUrl: './austrittserklaerung.css',
})
export class Austrittserklaerung {
  anrede = '';
  name = '';
  vorname = '';
  email = '';
  /* Wie im alten Formular jeweils die erste Option vorausgewaehlt. */
  bisher: BisherigerStatus = 'Aktivmitglied';
  neu: NeuerStatus = 'Austritt aus Verband';
  bemerkungen = '';

  readonly anreden = ['Frau', 'Herr'];
  readonly bisherigeStatus: BisherigerStatus[] = [
    'Aktivmitglied',
    'Passivmitglied',
    'Freimitglied',
    'Ehrenmitglied',
  ];
  readonly neueStatus: NeuerStatus[] = [
    'Austritt aus Verband',
    'Aktivmitglied',
    'Passivmitglied',
  ];

  readonly loading = signal(false);
  readonly done = signal(false);
  readonly error = signal('');
  /** Erst nach dem ersten Absenden meckern, nicht schon beim Tippen. */
  readonly submitted = signal(false);

  get emailOk(): boolean {
    return EMAIL_RE.test(this.email.trim());
  }

  get valid(): boolean {
    return !!(
      this.anrede &&
      this.name.trim() &&
      this.vorname.trim() &&
      this.emailOk &&
      this.bisher &&
      this.neu
    );
  }

  submit(): void {
    if (this.loading() || this.done()) return;
    this.submitted.set(true);

    if (!this.valid) {
      this.error.set('Bitte füllen Sie alle Pflichtfelder korrekt aus.');
      return;
    }

    this.error.set('');
    this.loading.set(true);

    /*
     * Wie bei den anderen Formularen: die API hat dafuer noch keinen
     * Endpunkt (siehe api/index.php). Die Seite bestaetigt den Versand
     * vorerst nur im Browser, gespeichert oder verschickt wird noch nichts.
     */
    this.loading.set(false);
    this.done.set(true);
  }
}
