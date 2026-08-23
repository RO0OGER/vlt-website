import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NAV } from '../../shared/nav';

@Component({
  selector: 'app-footer',
  imports: [RouterLink],
  templateUrl: './footer.html',
  styleUrl: './footer.css',
})
export class Footer {
  /** Dieselben Ziele wie im Kopf – siehe shared/nav.ts. */
  readonly nav = NAV;

  protected readonly year = new Date().getFullYear();
}
