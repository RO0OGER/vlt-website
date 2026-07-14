import { Component } from '@angular/core';

interface Post {
  cat: string;
  title: string;
  excerpt: string;
  date: string;
  read: string;
}

interface EventItem {
  day: string;
  mon: string;
  cat: string;
  t: string;
  loc: string;
  time: string;
  tag: 'Mitglieder' | 'Offen';
}

interface Sponsor {
  name: string;
  mark: string;
}

@Component({
  selector: 'app-home',
  templateUrl: './home.html',
  styleUrl: './home.css',
})
export class Home {
  readonly posts: Post[] = [
    {
      cat: 'Digitalisierung',
      title: 'Digitalisierung im kaufmännischen Bereich',
      excerpt:
        'Erfahren Sie, wie moderne Technologien den kaufmännischen Alltag verändern und wie Sie davon profitieren können.',
      date: '24. Mai 2026',
      read: '6 min',
    },
    {
      cat: 'Lehre',
      title: 'Technische Grundlagen für Lehrende',
      excerpt:
        'Vertiefen Sie Ihr technisches Wissen, um Ihre Unterrichtsinhalte noch praxisnäher zu gestalten.',
      date: '18. Mai 2026',
      read: '8 min',
    },
    {
      cat: 'Netzwerk',
      title: 'Netzwerken und Erfahrungsaustausch',
      excerpt:
        'Nutzen Sie unsere Veranstaltungen, um sich mit Kolleginnen und Kollegen auszutauschen und neue Impulse zu erhalten.',
      date: '11. Mai 2026',
      read: '4 min',
    },
    {
      cat: 'Cloud',
      title: 'Cloud-Technologien im Büroalltag',
      excerpt: 'Lernen Sie, wie Cloud-Lösungen Ihre Arbeitsprozesse effizienter machen.',
      date: '04. Mai 2026',
      read: '5 min',
    },
    {
      cat: 'IT-Sicherheit',
      title: 'IT-Sicherheit für Lehrende',
      excerpt:
        'Schützen Sie Ihre Daten und die Ihrer Schüler mit praxisnahen Sicherheitstipps.',
      date: '28. April 2026',
      read: '7 min',
    },
    {
      cat: 'Daten',
      title: 'Datenanalyse und Reporting',
      excerpt: 'Verstehen Sie, wie Sie Daten sinnvoll auswerten und präsentieren können.',
      date: '21. April 2026',
      read: '9 min',
    },
  ];

  readonly events: EventItem[] = [
    { day: '12', mon: 'Juni', cat: 'Jahresversammlung', t: 'Delegiertenversammlung 2026', loc: 'KV Zürich Business School', time: '13:30 – 17:00', tag: 'Mitglieder' },
    { day: '04', mon: 'Sep', cat: 'Workshop', t: 'KI im Unterricht – praxisnah einsetzen', loc: 'Hybrid · Bern + Online', time: '09:00 – 16:00', tag: 'Offen' },
    { day: '22', mon: 'Okt', cat: 'Netzwerk-Apéro', t: 'Regionaltreffen Ostschweiz', loc: 'BZW St. Gallen', time: '18:00 – 21:00', tag: 'Offen' },
    { day: '14', mon: 'Nov', cat: 'Tagung', t: 'Digitaler Wandel im Klassenzimmer', loc: 'Kongresshaus Luzern', time: '09:30 – 17:00', tag: 'Mitglieder' },
  ];

  readonly sponsors: Sponsor[] = [
    { name: 'ECDL Schweiz', mark: 'ECDL' },
    { name: 'Klett Verlag', mark: 'Klett' },
    { name: 'Cornelsen', mark: 'C.' },
    { name: 'Helbling', mark: 'helbling' },
    { name: 'SAB', mark: 'SAB' },
    { name: 'hep verlag', mark: 'hep' },
    { name: 'Compendio', mark: 'Compendio' },
    { name: 'KV Bildungsgruppe', mark: 'KV' },
  ];

  get featured(): Post {
    return this.posts[0];
  }

  get rest(): Post[] {
    return this.posts.slice(1);
  }
}
