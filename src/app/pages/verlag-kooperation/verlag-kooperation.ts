import { Component } from '@angular/core';

interface Publisher {
  name: string;
  image: string;
}

@Component({
  selector: 'app-verlag-kooperation',
  standalone: true,
  templateUrl: './verlag-kooperation.html',
  styleUrl: './verlag-kooperation.css',
})
export class VerlangKooperation {
  readonly publishers: Publisher[] = [
    { name: 'Edulino', image: '/verlag-kooperation/Logo_edulino_farbig_72dpi_RGB.webp' },
    { name: 'Verlag SKV', image: '/verlag-kooperation/Logo_VerlagSKV_2f.webp' },
    { name: 'HERDT', image: '/verlag-kooperation/HERDT-Logo_RGB.webp' },
    { name: 'Wings Lernmedien', image: '/verlag-kooperation/wings-logo-rgb.webp' },
    { name: 'ON ICT – Informations- und Kommunikationstechnologie', image: '/verlag-kooperation/ON-ICT.webp' },
  ];
}

