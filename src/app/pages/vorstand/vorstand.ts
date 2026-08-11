import { Component } from '@angular/core';

/** Ein Vorstandsmitglied. Struktur wie eine API sie spaeter liefern wuerde. */
interface BoardMember {
  name: string;
  /** Rolle im Verband, z. B. "Co-Präsidium". Leer, wenn keine gepflegt ist. */
  role?: string;
  /** Funktion in der IKA, z. B. "IKA-Fachvorstand". */
  ikaFunction: string;
  /** Schule mit Name und Adresse der Website. */
  school: { name: string; url: string };
  email: string;
  /** Portraitbild im public-Ordner. Fehlt es, zeigt die Karte die Initialen. */
  photo?: string;
}

@Component({
  selector: 'app-vorstand',
  imports: [],
  templateUrl: './vorstand.html',
  styleUrl: './vorstand.css',
})
export class Vorstand {
  /** Dokument der Statuten – Adresse und Meta wie im public-Ordner abgelegt. */
  readonly statutes = {
    href: '/vorstand/20230318_Statuten_Verband-Lehrende-IKA_v1.pdf',
    version: '18. März 2023',
    size: '196,75 kB',
  };

  readonly members: BoardMember[] = [
    {
      name: 'Yvonne Widmer',
      role: 'Co-Präsidium, Kasse',
      ikaFunction: 'IKA-Fachschaftsleiterin',
      school: { name: 'BWD Bern', url: 'https://bwdbern.ch/' },
      email: 'kasse@verband-ika.ch',
      photo: '/vorstand/yvonne-widmer.webp',
    },
    {
      name: 'Valentin Hasler',
      role: 'Co-Präsidium',
      ikaFunction: 'IKA-Fachvorstand',
      school: { name: 'Bildungszentrum Wirtschaft Weinfelden', url: 'https://www.bzww.ch/' },
      email: 'webmaster@verband-ika.ch',
      photo: '/vorstand/valentin-hasler.webp',
    },
    {
      name: 'Carola Haueter',
      role: 'Newsletter, Website',
      ikaFunction: 'IKA-Lehrerin',
      school: { name: 'Handelsschule KV Aarau', url: 'https://www.hkvaarau.ch/' },
      email: 'carola.haueter@businessinstitute.ch',
      photo: '/vorstand/carola-haueter.webp',
    },
    {
      name: 'Cornelia Knöpfel',
      ikaFunction: 'IKA Lehrperson',
      school: { name: 'Berufsbildungszentrum Herisau', url: 'https://www.berufsschule.ch/' },
      email: 'cornelia.knoepfel@berufsschule.ch',
      photo: '/vorstand/Cornelia-Knöpfel.jpeg',
    },
  ];

  /** Initialen als Fallback, falls kein Portrait gepflegt ist. */
  initials(name: string): string {
    return name
      .split(' ')
      .map((part) => part.charAt(0))
      .join('')
      .slice(0, 2)
      .toUpperCase();
  }
}
