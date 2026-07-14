import { Component } from '@angular/core';

interface FooterCol {
  h: string;
  links: string[];
}

@Component({
  selector: 'app-footer',
  templateUrl: './footer.html',
  styleUrl: './footer.css',
})
export class Footer {
  protected readonly year = new Date().getFullYear();

  readonly columns: FooterCol[] = [
    { h: 'Engagements', links: ['Kooperation ECDL', 'Kooperation Verlage', 'SAB', 'BIVO 2022', 'Lehrplan 21'] },
    { h: 'Im Beruf', links: ['Ausbildung', 'Weiterbildung', 'Stellen', 'Links'] },
    { h: 'Verband', links: ['Unser Vorstand', 'Pensionierte', 'Newsletter', 'Mitgliederbereich'] },
    { h: 'Kontakt', links: ['Beitritt', 'Austritt', 'Adressmutation', 'Impressum', 'Datenschutz'] },
  ];
}
