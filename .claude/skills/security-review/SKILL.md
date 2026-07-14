---
name: security-review
description: Prueft Angular Frontend Code auf Sicherheitsluecken und typische Fehler. Nutze diesen Skill wenn Angular Komponenten, Templates, Services oder HTTP Aufrufe geschrieben oder geaendert werden, sowie vor jedem Commit und beim Review von Pull Requests.
---

# Security Review Frontend

Deine Aufgabe ist es, Angular Frontend Code auf Sicherheitsluecken und typische
Fehler zu pruefen, bevor er committet wird. Das Projekt ist eine Angular SPA, die
auf cyon.ch gehostet wird (statisches Apache Webhosting).

Wichtig zum Verstaendnis: Frontend Code ist immer oeffentlich sichtbar. Jeder kann
ihn im Browser lesen. Echte Sicherheit passiert spaeter im Backend. Trotzdem gibt es
im Frontend klare Fehler, die man vermeiden muss.

Gehe die Liste durch. Fuer jeden Fund: nenne Datei und Zeile, erklaere kurz und
einfach warum es ein Problem ist, und schlage die Korrektur vor. Der Nutzer ist im
3. Lehrjahr und soll dabei lernen, also erklaere das Warum.

## Keine Secrets im Frontend

- Keine Passwoerter, API Keys oder geheime Tokens im Angular Code. Alles im Frontend
  ist fuer jeden lesbar.
- Interne URLs oder Zugangsdaten, die geheim bleiben sollen, gehoeren nicht ins Frontend.
- Pruefe auch environment Dateien: nur oeffentliche Werte da rein.

## XSS und unsichere Ausgaben

- Angular escaped Ausgaben standardmaessig, das ist gut. Wo bypassSecurityTrust
  oder [innerHTML] genutzt wird, genau pruefen ob das noetig ist und ob der Inhalt
  sicher ist. Das umgeht Angulars Schutz.
- Keine Nutzereingaben ungeprueft in innerHTML schreiben.

## HTTP und Daten

- Alle API Aufrufe ueber HTTPS, nie http.
- Keine sensiblen Daten im URL Query String, die landen in Logs und im Browser Verlauf.
- Fehlerantworten sauber behandeln, keine internen Details ungefiltert anzeigen.

## Sauberer Code (typische Fehler)

- Keine console.log Ausgaben mit Daten im fertigen Build vergessen.
- Formulareingaben validieren, nicht nur auf ein spaeteres Backend vertrauen.
- Keine toten oder auskommentierten Code Bloecke mit alten URLs oder Testdaten drin.

## Deployment und cyon

- FTP Zugangsdaten fuer cyon nur als GitHub Secrets, nie in der Workflow Datei,
  nie im Repo.
- Pruefe ob eine .htaccess vorhanden ist, die das SPA Routing auf index.html
  umleitet, damit der direkte Aufruf einer Route oder ein Neuladen nicht in einem
  404 endet.

## Ausgabe

Fasse am Ende kurz zusammen: was geprueft wurde, was in Ordnung ist, und was
korrigiert werden muss. Wenn nichts gefunden wurde, sag das klar, statt Probleme
zu erfinden.
