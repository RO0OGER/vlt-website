import { Component, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

/** Art der Einzelmitgliedschaft. */
export type Mitgliedsart = 'aktiv' | 'passiv';

/**
 * Grobpruefung einer E-Mail-Adresse: etwas, ein @, etwas, ein Punkt, etwas.
 * Ob die Adresse wirklich existiert, weiss erst der Server beim Versand –
 * der Check faengt aber Tippfehler ab, bevor das Kennwort ins Leere geht.
 */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Schweizer Postleitzahlen haben vier Ziffern. */
const PLZ_RE = /^\d{4}$/;

@Component({
  selector: 'app-beitrittserklaerung',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './beitrittserklaerung.html',
  styleUrl: './beitrittserklaerung.css',
})
export class Beitrittserklaerung {
  /** Aktivmitglied ist der Normalfall und deshalb vorausgewaehlt. */
  art: Mitgliedsart = 'aktiv';

  anrede = '';
  name = '';
  vorname = '';
  strasse = '';
  plz = '';
  ort = '';
  email = '';
  /*
   * Ebenfalls Pflicht: Schuladressen erloeschen mit der Anstellung, die
   * private Adresse bleibt und haelt den Kontakt zum Mitglied aufrecht.
   */
  emailPrivat = '';
  geburtsdatum = '';
  schule = '';

  readonly anreden = ['Frau', 'Herr', 'Keine Angabe'];

  readonly loading = signal(false);
  readonly done = signal(false);
  readonly error = signal('');
  /** Erst nach dem ersten Absenden meckern, nicht schon beim Tippen. */
  readonly submitted = signal(false);

  get emailOk(): boolean {
    return EMAIL_RE.test(this.email.trim());
  }

  get emailPrivatOk(): boolean {
    return EMAIL_RE.test(this.emailPrivat.trim());
  }

  get plzOk(): boolean {
    return PLZ_RE.test(this.plz.trim());
  }

  /** Alle Pflichtfelder ausgefuellt und plausibel? */
  get valid(): boolean {
    return !!(
      this.anrede &&
      this.name.trim() &&
      this.vorname.trim() &&
      this.strasse.trim() &&
      this.plzOk &&
      this.ort.trim() &&
      this.emailOk &&
      this.emailPrivatOk
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
     * Die API hat noch keinen Endpunkt fuer Beitritte (siehe api/index.php).
     * Bis der steht, bestaetigt die Seite den Versand nur im Browser – die
     * Anmeldung wird also noch nirgends gespeichert und es geht auch noch
     * kein Kennwort raus. Sobald es POST /api/beitritt gibt, kommt der
     * Aufruf hier hinein.
     */
    this.loading.set(false);
    this.done.set(true);
  }
}
