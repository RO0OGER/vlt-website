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
    // Detailseite eines Beitrags. Die ID kommt spaeter aus der API.
    path: 'beitraege/:id',
    loadComponent: () =>
      import('./pages/beitraege/beitrag-detail/beitrag-detail').then(
        (m) => m.BeitragDetailPage,
      ),
    // Titel aus dem Beitrag statt fix, damit Tab und Lesezeichen ihn zeigen.
    title: (route) =>
      import('./pages/beitraege/posts').then(
        (m) => `${m.findPost(route.paramMap.get('id'))?.title ?? 'Beitrag'} – Verband`,
      ),
  },
  {
    path: 'verbandsanlaesse',
    loadComponent: () =>
      import('./pages/verbandsanlaesse/verbandsanlaesse').then(
        (m) => m.Verbandsanlaesse,
      ),
    title: 'Verbandsanlässe – Verband',
  },
  {
    // Detailseite eines Anlasses. Die ID kommt spaeter aus dem CMS.
    path: 'verbandsanlaesse/:id',
    loadComponent: () =>
      import('./pages/verbandsanlaesse/event-detail/event-detail').then(
        (m) => m.EventDetailPage,
      ),
    // Titel aus dem Anlass statt fix, damit Tab und Lesezeichen ihn zeigen.
    title: (route) =>
      import('./pages/verbandsanlaesse/events').then(
        (m) => `${m.findEvent(route.paramMap.get('id'))?.t ?? 'Anlass'} – Verband`,
      ),
  },
  {
    path: 'kontakt',
    loadComponent: () =>
      import('./pages/contact/contact').then((m) => m.Contact),
    title: 'Kontakt – Verband',
  },
  {
    path: 'ecdl-kooperation',
    loadComponent: () =>
      import('./pages/ecdl-kooperation/ecdl-kooperation').then((m) => m.EcdlKooperation),
    title: 'ECDL-Kooperation – Verband',
  },
  {
    path: 'verlag-kooperation',
    loadComponent: () =>
      import('./pages/verlag-kooperation/verlag-kooperation').then((m) => m.VerlangKooperation),
    title: 'Kooperation mit Verlagen – Verband',
  },
  {
    path: 'sab',
    loadComponent: () =>
      import('./pages/sab/sab').then((m) => m.Sab),
    title: 'SAB – Verband',
  },
  {
    path: 'bivo-2022',
    loadComponent: () =>
      import('./pages/bivo-2022/bivo-2022').then((m) => m.Bivo2022),
    title: 'BIVO 2022 – Verband',
  },
  {
    path: 'qv-pruefungen',
    loadComponent: () =>
      import('./pages/qv-pruefungen/qv-pruefungen').then((m) => m.QvPruefungen),
    title: 'QV-Prüfungen – Verband',
  },
  {
    path: 'lehrplan-21',
    loadComponent: () =>
      import('./pages/lehrplan-21/lehrplan-21').then((m) => m.Lehrplan21),
    title: 'Lehrplan 21 – Verband',
  },
  {
    path: 'corporate-wording',
    loadComponent: () =>
      import('./pages/corporate-wording/corporate-wording').then((m) => m.CorporateWording),
    title: 'Corporate Wording® – Verband',
  },
  {
    path: 'ausbildung',
    loadComponent: () =>
      import('./pages/ausbildung/ausbildung').then((m) => m.Ausbildung),
    title: 'Ausbildung – Verband',
  },
  {
    path: 'links',
    loadComponent: () =>
      import('./pages/links/links').then((m) => m.Links),
    title: 'Links – Verband',
  },
  {
    path: 'teilnehmerkosten',
    loadComponent: () =>
      import('./pages/teilnehmerkosten/teilnehmerkosten').then((m) => m.Teilnehmerkosten),
    title: 'Teilnehmerkosten – Verband',
  },
  {
    path: '**',
    loadComponent: () =>
      import('./pages/not-found/not-found').then((m) => m.NotFound),
    title: 'Seite nicht gefunden – Verband',
  },
];
