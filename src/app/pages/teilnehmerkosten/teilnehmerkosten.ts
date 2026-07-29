import { Component } from '@angular/core';

interface PriceRow {
  event: string;
  neither: string;
  eitherOne: string;
  both: string;
}

@Component({
  selector: 'app-teilnehmerkosten',
  standalone: true,
  templateUrl: './teilnehmerkosten.html',
  styleUrl: './teilnehmerkosten.css',
})
export class Teilnehmerkosten {
  readonly prices: PriceRow[] = [
    {
      event: 'IKA-Workshop',
      neither: 'CHF 290.–',
      eitherOne: 'CHF 230.–',
      both: 'CHF 200.–',
    },
    {
      event: 'Tägiger Weiterbildungskurs',
      neither: 'CHF 290.–',
      eitherOne: 'CHF 230.–',
      both: 'CHF 200.–',
    },
    {
      event: 'Kadervernetzung',
      neither: 'CHF 180.–',
      eitherOne: 'CHF 120.–',
      both: 'CHF 120.–',
    },
  ];
}

