import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { catchError, map, of } from 'rxjs';
import { AuthService } from './auth.service';

/**
 * Schuetzt Admin-Routen: Weiterleitung auf /admin/login wenn nicht angemeldet.
 *
 * Gilt noch das verteilte Startpasswort, geht es stattdessen auf die
 * Passwortseite. Die API laesst in diesem Zustand ohnehin nichts zu; ohne
 * diese Weiche saehe man ueberall nur Fehlermeldungen und wuesste nicht,
 * warum.
 */
export const authGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (!auth.getToken()) {
    return of(router.createUrlTree(['/admin/login']));
  }

  return auth.verifyToken().pipe(
    map(() =>
      auth.mustChangePassword() ? router.createUrlTree(['/admin/passwort']) : true,
    ),
    catchError(() => {
      auth.logout();
      return of(router.createUrlTree(['/admin/login']));
    }),
  );
};

/**
 * Fuer die Passwortseite: ein gueltiges Token genuegt.
 *
 * Bewusst ohne die Pruefung aus authGuard – wer sein Passwort aendern muss,
 * kaeme dort sonst nie an. Die Seite dient auch dem freiwilligen Wechsel.
 */
export const passwordGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (!auth.getToken()) {
    return of(router.createUrlTree(['/admin/login']));
  }

  return auth.verifyToken().pipe(
    map(() => true),
    catchError(() => {
      auth.logout();
      return of(router.createUrlTree(['/admin/login']));
    }),
  );
};

/** Verhindert Zugriff auf /admin/login wenn bereits angemeldet. */
export const loginGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (auth.getToken()) {
    return router.createUrlTree(['/admin']);
  }
  return true;
};
