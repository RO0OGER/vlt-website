import { Component } from '@angular/core';

import { PUBLISHERS } from '../../shared/publishers';

@Component({
  selector: 'app-verlag-kooperation',
  standalone: true,
  templateUrl: './verlag-kooperation.html',
  styleUrl: './verlag-kooperation.css',
})
export class VerlangKooperation {
  /* Gemeinsame Liste mit dem Partner-Raster der Startseite. */
  readonly publishers = PUBLISHERS;
}
