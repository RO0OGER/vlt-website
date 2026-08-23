import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-newsletter',
  templateUrl: './newsletter.html',
  styleUrl: './newsletter.css',
  imports: [FormsModule],
})
export class Newsletter {
  vorname = '';
  nachname = '';
  email = '';
  gesendet = false;

  absenden() {
    if (this.vorname && this.nachname && this.email) {
      this.gesendet = true;
    }
  }
}
