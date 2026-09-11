import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';

import { AuthService } from '../../../shared/auth.service';
import { apiErrorText } from '../../../shared/admin-api';

/** Kuerzestes erlaubtes Passwort – derselbe Wert wie in der API. */
const MIN_LAENGE = 12;

/**
 * Passwort aendern.
 *
 * Zwei Wege fuehren hierher: der erzwungene Wechsel nach dem ersten Anmelden
 * mit dem verteilten Startpasswort, und der freiwillige ueber die Seitenleiste.
 * Der Unterschied ist nur die Beschriftung – der Vorgang ist derselbe.
 *
 * Eine eigene Seite ausserhalb der Admin-Huelle, nicht ein Feld irgendwo
 * darin: solange das Startpasswort gilt, weist die API alles unter
 * /api/admin/ ab. Eine Seitenleiste mit lauter Verweisen, die nur zurueck
 * hierher fuehren, waere eine Einladung zum Herumirren.
 */
@Component({
  selector: 'app-admin-passwort',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './passwort.html',
  styleUrl: './passwort.css',
})
export class Passwort {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly minLength = MIN_LAENGE;
  /** Erzwungen oder freiwillig? Entscheidet nur ueber den Text. */
  readonly forced = this.auth.mustChangePassword;

  /*
   * Alle drei Felder sind Signale, nicht einfache Eigenschaften.
   *
   * Ein computed() rechnet nur neu, wenn sich ein Signal aendert, das es
   * gelesen hat. Eine gewoehnliche Eigenschaft merkt es nie – der Knopf
   * bliebe gesperrt, egal was man tippt.
   */
  readonly current = signal('');
  readonly next = signal('');
  readonly repeat = signal('');

  readonly saving = signal(false);
  readonly error = signal('');

  readonly tooShort = computed(() => {
    const next = this.next();
    return next.length > 0 && next.length < MIN_LAENGE;
  });

  readonly mismatch = computed(() => {
    const next = this.next();
    const repeat = this.repeat();
    return repeat.length > 0 && next !== repeat;
  });

  /**
   * Erst alle Signale lesen, dann pruefen.
   *
   * Das ist kein Schoenheitsfehler, sondern noetig: `&&` bricht bei der
   * ersten falschen Bedingung ab. Stuenden die Aufrufe direkt in der Kette,
   * wuerde beim ersten Durchlauf – leeres aktuelles Passwort – hinter der
   * zweiten Bedingung abgebrochen. Angular merkte sich dann nur die bis
   * dahin gelesenen Signale als Abhaengigkeit und rechnete beim Tippen in
   * den anderen Feldern gar nicht mehr nach.
   */
  readonly canSubmit = computed(() => {
    const current = this.current();
    const next = this.next();
    const repeat = this.repeat();
    const saving = this.saving();

    return !saving && current !== '' && next.length >= MIN_LAENGE && next === repeat;
  });

  submit(): void {
    if (!this.canSubmit()) return;

    this.error.set('');
    this.saving.set(true);

    this.auth.changePassword(this.current(), this.next()).subscribe({
      next: () => {
        this.saving.set(false);
        this.router.navigate(['/admin']);
      },
      error: (err) => {
        this.saving.set(false);
        this.error.set(apiErrorText(err, 'Das Passwort liess sich nicht ändern.'));
      },
    });
  }

  /** Abmelden, falls jemand hier landet und doch nicht weitermachen will. */
  logout(): void {
    this.auth.logout();
  }
}
