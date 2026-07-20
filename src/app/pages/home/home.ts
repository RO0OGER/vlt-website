import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

import { BlogPost, formatPostDate, sortedPosts } from '../beitraege/posts';
import { MONTHS_DE, parseDate, upcomingEvents } from '../verbandsanlaesse/events';

/** Ein Beitrag, aufbereitet fuer die Startseite. */
interface Post extends BlogPost {
  /** Ausgeschriebenes Datum – die Startseite formatiert selbst nichts. */
  dateLabel: string;
}

interface EventItem {
  id: number;
  day: string;
  mon: string;
  year: string;
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
  imports: [RouterLink],
  templateUrl: './home.html',
  styleUrl: './home.css',
})
export class Home {
  /**
   * Die sechs neusten Beitraege, abgeleitet aus derselben Quelle wie die
   * Galerie unter /beitraege. Frueher standen sie hier ein zweites Mal fest
   * im Code – gepflegt wird jetzt nur noch in posts.ts bzw. spaeter in der API.
   */
  readonly posts: Post[] = sortedPosts()
    .slice(0, 6)
    .map((p) => ({ ...p, dateLabel: formatPostDate(p.date) }));

  /**
   * Die naechsten vier Anlaesse, abgeleitet aus derselben Quelle wie
   * Zeitstrahl, Liste und Detailseite. Frueher standen sie hier ein zweites
   * Mal fest im Code und waren bereits auseinandergelaufen – gepflegt wird
   * jetzt nur noch in events.ts bzw. spaeter im CMS.
   */
  readonly events: EventItem[] = upcomingEvents(4).map((ev) => {
    const d = parseDate(ev.date);
    return {
      id: ev.id,
      day: String(d.getDate()).padStart(2, '0'),
      mon: MONTHS_DE[d.getMonth()],
      year: String(d.getFullYear()),
      // Der Kicker lautet z. B. "Workshop / Weiterbildung" – fuer die schmale
      // Spalte reicht der Teil vor dem Schraegstrich.
      cat: ev.kicker.split('/')[0].trim(),
      t: ev.t,
      loc: ev.location.name,
      time: ev.end ? `${ev.start} – ${ev.end}` : `ab ${ev.start}`,
      tag: ev.tag,
    };
  });

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
