import { NgTemplateOutlet } from '@angular/common';
import { Component, input } from '@angular/core';

import { MapView } from '../map/map-view';
import { SectionView, ViewImage } from '../post-view';

/**
 * Die Abschnitte eines Beitrags oder Events: Text, Zwischentitel, Zitat,
 * Bilder, Tabelle, Dokumente, Link und Karte – so, wie sie im CMS aus
 * Bausteinen zusammengesetzt wurden.
 *
 * Eine eigene Komponente, weil zwei Seiten sie zeigen: die Detailseite der
 * Beitraege und die der Verbandsanlaesse. Beide sehen drumherum anders aus,
 * der Inhalt soll aber ueberall gleich gesetzt sein.
 */
@Component({
  selector: 'app-post-sections',
  imports: [NgTemplateOutlet, MapView],
  templateUrl: './post-sections.html',
  styleUrl: './post-sections.css',
})
export class PostSections {
  readonly sections = input.required<SectionView[]>();

  /** Das Layout kennt eine und zwei Bilder – mehr zeigt die Seite nicht. */
  images(section: { images: ViewImage[] }): ViewImage[] {
    return section.images.slice(0, 2);
  }
}
