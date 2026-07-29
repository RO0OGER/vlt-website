import { Component } from '@angular/core';

interface LinkItem {
  title: string;
  url: string;
  description?: string;
}

interface LinkCategory {
  name: string;
  links: LinkItem[];
}

@Component({
  selector: 'app-links',
  standalone: true,
  templateUrl: './links.html',
  styleUrl: './links.css',
})
export class Links {
  readonly categories: LinkCategory[] = [
    {
      name: 'CH',
      links: [
        { title: 'Bundesbehörden', url: 'https://www.admin.ch' },
        { title: 'Bundesamt für Berufsbildung und Technologie (BBT)', url: '#' },
        { title: 'Portal zur Schweizerischen Berufsbildung', url: 'https://www.berufsbildung.ch' },
        { title: 'Bundesamt für Statistik', url: '#' },
        { title: 'Schweizer Schulferienkalender', url: 'https://www.schulferien.org/schweiz/ferien/' },
        { title: 'KV Grundbildung', url: '#' },
        { title: 'Umsetzung Bildungsreform 2012', url: '#' },
        { title: 'Rahmenlehrplan für die Berufsmaturität', url: '#' },
        { title: 'Kaufmännischer Verband Schweiz', url: 'https://www.kvschweiz.ch' },
        { title: 'Schweizerische Prüfungskommission für die kaufmännische Grundbildung', url: '#' },
        { title: 'Neue Kaufmännische Grundbildung (NKG)', url: '#' },
        { title: 'IG Kaufmännische Grundbildung Schweiz', url: 'https://www.igkg.ch' },
        { title: 'Deutschschweizer Berufsbildungsämter-Konferenz', url: '#' },
        { title: 'Schweizerische Konferenz kaufmännischer Berufsschulen', url: '#' },
        { title: 'Eidgenössisches Hochschulinstitut für Berufsbildung', url: '#' },
        { title: 'Schweizerischer Arbeitgeberverband', url: 'https://www.arbeitgeber.ch' },
        { title: 'Schweizerische Arbeitsgemeinschaft für Bildungsmanagement', url: '#' },
        { title: 'Reformkommission Kaufmännische Grundbildung EFZ', url: '#' },
        { title: 'Bildung und ICT', url: '#' },
      ],
    },
    {
      name: 'Verbände',
      links: [
        { title: 'Schweizerischer Verband der Lehrpersonen an kaufmännischen Berufsschulen', url: '#' },
        { title: 'Tessiner Sektion des Verbandes IKA', url: '#' },
        { title: 'ASSAP – Association suisse pour la bureautique et la communication', url: '#' },
      ],
    },
    {
      name: 'Websites von IKA-Mitgliedern',
      links: [
        { title: 'Rolf Bänziger, IKA-Fachvorstand, Schaffhausen', url: 'https://www.rolf-baenziger.ch' },
        { title: 'Rainer Lubasch, IKA-Fachvorstand, Thun', url: 'https://www.lubasch.ch' },
      ],
    },
    {
      name: 'Weiterbildung Tastaturschreiben',
      links: [
        { title: 'Methodisch-didaktische Weiterbildung in Tastaturschreiben', url: 'https://www.fhnw.ch/de/weiterbildung/paedagogik/kurse/9231364' },
      ],
    },
    {
      name: 'Verschiedenes',
      links: [
        { title: 'Infoportal für Lernende', url: 'https://www.lernender.ch' },
        { title: 'Gesetze', url: 'https://www.gesetze.ch' },
        { title: '«Glücklich und zufrieden mit Tesafilm» von Tim Höttges', url: '#' },
        { title: 'Ausbildung zur IKA-Lehrperson am EHB', url: '#', description: 'Bericht von Dr. Martin Holder in den IKA News 2016' },
        { title: 'Webpalette – Kurskatalog für Berufsfachschulen', url: 'https://www.webpalette.ch' },
      ],
    },
  ];
}

