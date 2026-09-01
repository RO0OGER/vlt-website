/**
 * Die Verlage, mit denen der Verband zusammenarbeitet.
 *
 * Zwei Stellen zeigen dieselben Logos: die Seite «Kooperation mit Verlagen»
 * ausführlich und die Startseite unten im Partner-Raster. Beide lesen aus
 * dieser Liste – sonst pflegt jemand einen neuen Verlag nur an einer Stelle
 * und die andere zeigt monatelang einen veralteten Stand.
 *
 * Die Bilder liegen unter public/verlag-kooperation/ und werden von Angular
 * unveraendert nach dist/ kopiert.
 */

export interface Publisher {
  name: string;
  /** Pfad zum Logo, absolut ab der Domain-Wurzel. */
  image: string;
}

export const PUBLISHERS: Publisher[] = [
  { name: 'Edulino', image: '/verlag-kooperation/Logo_edulino_farbig_72dpi_RGB.webp' },
  { name: 'Verlag SKV', image: '/verlag-kooperation/Logo_VerlagSKV_2f.webp' },
  { name: 'HERDT', image: '/verlag-kooperation/HERDT-Logo_RGB.webp' },
  { name: 'Wings Lernmedien', image: '/verlag-kooperation/wings-logo-rgb.webp' },
  {
    name: 'ON ICT – Informations- und Kommunikationstechnologie',
    image: '/verlag-kooperation/ON-ICT.webp',
  },
];
