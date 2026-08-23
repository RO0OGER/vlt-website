import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { catchError, map, of } from 'rxjs';
import { AuthService } from './auth.service';

/** Schuetzt Admin-Routen: Weiterleitung auf /admin/login wenn nicht angemeldet. */
export const authGuard: CanActivateFn = () => {
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
