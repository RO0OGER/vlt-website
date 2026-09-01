# VltWebsite

This project was generated using [Angular CLI](https://github.com/angular/angular-cli) version 20.3.32.

## Development server

To start a local development server, run:

```bash
ng serve
```

Once the server is running, open your browser and navigate to `http://localhost:4200/`. The application will automatically reload whenever you modify any of the source files.

## Code scaffolding

Angular CLI includes powerful code scaffolding tools. To generate a new component, run:

```bash
ng generate component component-name
```

For a complete list of available schematics (such as `components`, `directives`, or `pipes`), run:

```bash
ng generate --help
```

## Building

To build the project run:

```bash
ng build
```

This will compile your project and store the build artifacts in the `dist/` directory. By default, the production build optimizes your application for performance and speed.

## Running unit tests

To execute unit tests with the [Karma](https://karma-runner.github.io) test runner, use the following command:

```bash
ng test
```

## Running end-to-end tests

For end-to-end (e2e) testing, run:

```bash
ng e2e
```

Angular CLI does not come with an end-to-end testing framework by default. You can choose one that suits your needs.

## Additional Resources

For more information on using the Angular CLI, including detailed command references, visit the [Angular CLI Overview and Command Reference](https://angular.dev/tools/cli) page.

## Demo auf Vercel

Der Auftritt läuft produktiv auf cyon.ch (Apache + PHP). Die Lese-API liegt
dort unter `/api/` und wird von `api/.htaccess` an `api/index.php` verteilt.

Vercel führt kein PHP aus und ignoriert `.htaccess`. Eine Anfrage an
`/api/posts` landet dort deshalb beim SPA-Fallback und liefert `index.html`
mit Status 200 zurück – im Netzwerk-Tab sieht das nach einer erfolgreichen
Antwort aus, ist aber HTML statt JSON. Angular kann das nicht lesen, die
Beitrags- und Galerieseiten bleiben leer.

`vercel.json` reicht `/api/...` deshalb serverseitig an die echte Domain
weiter. Für den Browser bleibt alles dieselbe Herkunft, die API braucht also
keine CORS-Kopfzeilen. Zieht die API auf eine andere Domain um, wird das Ziel
dort angepasst.
