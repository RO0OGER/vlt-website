import { AfterViewInit, Component, OnDestroy, signal } from '@angular/core';

/**
 * Stellenangebote – eingebundene guidle-Microsite.
 *
 * Die Stellen werden nicht hier gepflegt, sondern bei guidle. Eingebunden
 * wird die Microsite als IFrame. Dazu gehoeren drei Skripte, die guidle in
 * genau dieser Reihenfolge vorgibt: jQuery, das postMessage-Plugin und das
 * Container-Modul. Das Container-Modul sucht IFrames, deren ID mit "guidle_"
 * beginnt, baut aus dem data-src die endgueltige Adresse zusammen und passt
 * die Hoehe des IFrames per postMessage laufend an den Inhalt an – sonst
 * bliebe es auf den 400 px aus dem Template stehen.
 *
 * Die Skripte stehen bewusst hier und nicht in der index.html: so laedt sie
 * nur, wer diese Seite tatsaechlich oeffnet.
 */
interface ScriptSource {
  src: string;
  /** Pruefsumme (Subresource Integrity), sofern die Adresse eine feste Version hat. */
  integrity?: string;
}

const GUIDLE_SCRIPTS: ScriptSource[] = [
  {
    src: 'https://ajax.googleapis.com/ajax/libs/jquery/2.1.3/jquery.min.js',
    // Pruefsumme der offiziellen jQuery 2.1.3. Liefert das CDN etwas anderes
    // aus, verweigert der Browser die Ausfuehrung und die Seite zeigt den
    // Ersatzlink. Nur bei fester Version moeglich – die beiden guidle-Skripte
    // aendern sich ohne Versionsnummer und koennen das nicht bekommen.
    integrity: 'sha384-E7gp+UYBLS2XewcxoJbfi0UpGMHSvt9XyI9bH4YIw5GDGW8AlC+2J7bVBBlMFC6p',
  },
  { src: 'https://www.guidle.com/js/jquery.ba-postmessage.min.js' },
  {
    src: 'https://www.guidle.com/hosted/template_portal/microsite/static/js/micrositeContainerModule.js',
  },
];

/** Muss mit der ID des IFrames in stellen.html uebereinstimmen. */
const GUIDLE_IFRAME_ID = 'guidle_iframe-r33pYk';

/** Der Teil des guidle-Moduls, den diese Seite selbst aufruft. */
interface GuidleModule {
  /** Setzt die src des IFrames aus seinem data-src. Ist src schon gesetzt, passiert nichts. */
  load(iframeId: string): boolean;
}

@Component({
  selector: 'app-stellen',
  standalone: true,
  templateUrl: './stellen.html',
  styleUrl: './stellen.css',
})
export class Stellen implements AfterViewInit, OnDestroy {
  /** Zeigt den Ersatzlink, wenn die guidle-Skripte nicht geladen werden konnten. */
  readonly failed = signal(false);

  private destroyed = false;

  ngAfterViewInit(): void {
    void this.mountWidget();
  }

  ngOnDestroy(): void {
    this.destroyed = true;
  }

  /**
   * Laedt die Skripte nacheinander – sie bauen aufeinander auf – und stoesst
   * danach das IFrame an. Beim ersten Besuch findet das Modul es schon beim
   * eigenen Start; beim zweiten Besuch sind die Skripte laengst geladen und
   * nur der load()-Aufruf setzt das neu gerenderte IFrame in Gang.
   */
  private async mountWidget(): Promise<void> {
    try {
      for (const script of GUIDLE_SCRIPTS) {
        await loadScriptOnce(script);
      }
    } catch {
      this.failed.set(true);
      return;
    }

    // Die Seite kann waehrend des Ladens schon wieder verlassen worden sein.
    if (this.destroyed) return;

    const guidle = (window as unknown as { PORTALMODULEIFRAME?: GuidleModule })
      .PORTALMODULEIFRAME;
    guidle?.load(GUIDLE_IFRAME_ID);
  }
}

/**
 * Bereits angefragte Skripte, damit sie beim erneuten Aufruf der Seite nicht
 * ein zweites Mal im Dokument landen.
 */
const scriptCache = new Map<string, Promise<void>>();

/** Haengt ein Skript einmalig an das Dokument und meldet, wenn es bereit ist. */
function loadScriptOnce({ src, integrity }: ScriptSource): Promise<void> {
  const cached = scriptCache.get(src);
  if (cached) return cached;

  const pending = new Promise<void>((resolve, reject) => {
    const el = document.createElement('script');
    el.src = src;
    // Reihenfolge zaehlt: erst laden, dann das naechste Skript anfordern.
    el.async = false;
    if (integrity) {
      el.integrity = integrity;
      // Ohne CORS-Anfrage kann der Browser die Pruefsumme nicht vergleichen.
      el.crossOrigin = 'anonymous';
    }
    el.onload = () => resolve();
    el.onerror = () => {
      // Fehlversuch nicht merken, damit ein spaeterer Aufruf es erneut probiert.
      scriptCache.delete(src);
      el.remove();
      reject(new Error(`guidle-Skript konnte nicht geladen werden: ${src}`));
    };
    document.body.appendChild(el);
  });

  scriptCache.set(src, pending);
  return pending;
}
