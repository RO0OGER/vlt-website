import { Component, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

/**
 * Grobpruefung einer E-Mail-Adresse: etwas, ein @, etwas, ein Punkt, etwas.
 * Genauer geht es im Browser nicht sinnvoll – ob die Adresse wirklich
 * existiert, weiss erst der Server beim Versand. Der Check faengt aber
 * Tippfehler ab, bevor jemand vergeblich auf Post wartet.
 */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

@Component({
  selector: 'app-newsletter',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './newsletter.html',
  styleUrl: './newsletter.css',
})
export class Newsletter {
  email = '';
  vorname = '';
  nachname = '';

  /** Laeuft eine Anmeldung? Sperrt das Formular gegen Doppelklicks. */
  readonly loading = signal(false);
  /** Anmeldung war erfolgreich – dann zeigt die Seite die Bestaetigung. */
  readonly done = signal(false);
  readonly error = signal('');
  /** Erst nach dem ersten Absenden meckern, nicht schon beim Tippen. */
  readonly submitted = signal(false);

  get emailOk(): boolean {
    return EMAIL_RE.test(this.email.trim());
  }

  get valid(): boolean {
    return this.emailOk && !!this.vorname.trim() && !!this.nachname.trim();
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
     * Die API hat noch keinen Newsletter-Endpunkt (siehe api/index.php). Bis
     * der steht, bestaetigt die Seite die Anmeldung nur im Browser – die
     * Daten werden also noch nirgends gespeichert. Sobald es
     * POST /api/newsletter gibt, wird der Aufruf hier eingesetzt.
     */
    this.loading.set(false);
    this.done.set(true);
  }

  /** Zurueck zum leeren Formular, um jemand zweiten anzumelden. */
  reset(): void {
    this.email = '';
    this.vorname = '';
    this.nachname = '';
    this.done.set(false);
    this.submitted.set(false);
    this.error.set('');
  }
}
