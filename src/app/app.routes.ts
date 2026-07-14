import { Routes } from '@angular/router';

/**
 * Statische Routen des Verbands-Auftritts.
 *
 * Alle Seiten werden lazy geladen (loadComponent). Das hält das initiale
 * Bundle klein und ist die Grundlage, um spaeter CMS-Inhalte zu ergaenzen:
 * Sobald ein CMS angebunden wird, kann hier z. B. eine dynamische Route wie
 *   { path: ':slug', loadComponent: () => import('./pages/cms-page/cms-page') }
 * ergaenzt werden, die den Inhalt anhand des Slugs vom CMS laedt. Bis dahin
 * bleiben es feste, ausprogrammierte Seiten.
 */
export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () => import('./pages/home/home').then((m) => m.Home),
    title: 'Home – Verband',
  },
  {
    path: 'ueber-uns',
    loadComponent: () => import('./pages/about/about').then((m) => m.About),
    title: 'Über uns – Verband',
  },
  {
    path: 'beitraege',
    loadComponent: () =>
      import('./pages/beitraege/beitraege').then((m) => m.Beitraege),
    title: 'Beiträge – Verband',
  },
  {
    path: 'kontakt',
    loadComponent: () =>
      import('./pages/contact/contact').then((m) => m.Contact),
    title: 'Kontakt – Verband',
  },

  // Platzhalter fuer die spaetere CMS-Erweiterung (dynamische Seiten):
  // {
  //   path: ':slug',
  //   loadComponent: () => import('./pages/cms-page/cms-page').then((m) => m.CmsPage),
  // },

  {
    path: '**',
    loadComponent: () =>
      import('./pages/not-found/not-found').then((m) => m.NotFound),
    title: 'Seite nicht gefunden – Verband',
  },
];
