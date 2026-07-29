import { Component } from '@angular/core';

interface PdfDownload {
  title: string;
  subtitle: string;
  filename: string;
}

@Component({
  selector: 'app-bivo-2022',
  standalone: true,
  templateUrl: './bivo-2022.html',
  styleUrl: './bivo-2022.css',
})
export class Bivo2022 {
  readonly downloads: PdfDownload[] = [
    {
      title: 'News Januar 2021',
      subtitle: 'Kaufleute 2022 – News vom IKA-Verband',
      filename: '/bivo-2022/Kaufleute-2022-News-vom-IKA-Verband-Januar-2021.pdf',
    },
    {
      title: 'Projekt-News August 2019',
      subtitle: 'Aktuelles zum Projekt «Kaufleute 2022»',
      filename: '/bivo-2022/DENewsKaufleute2022August2019.pdf',
    },
    {
      title: 'Vollständiger Artikel',
      subtitle: 'Hintergrundinformationen als PDF',
      filename: '/bivo-2022/skkab_kaufmaennische_grundbildung_zukunftstauglich_25082016.pdf',
    },
    {
      title: 'Separatum 2017–2018',
      subtitle: 'Branche Öffentliche Verwaltung',
      filename: '/bivo-2022/informationen_ovap_17-18.pdf',
    },
  ];
}

