import { Component, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../../shared/auth.service';

@Component({
  selector: 'app-admin-login',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './login.html',
  styleUrl: './login.css',
})
export class Login {
  email    = '';
  password = '';

  readonly loading = signal(false);
  readonly error   = signal('');

  constructor(private auth: AuthService, private router: Router) {}

  submit(): void {
    if (this.loading()) return;
    this.error.set('');
    this.loading.set(true);

    this.auth.login(this.email, this.password).subscribe({
      next: () => this.router.navigate(['/admin']),
      error: (err) => {
        this.loading.set(false);
        const msg = err?.error?.error;
        this.error.set(msg ?? 'Anmeldung fehlgeschlagen.');
      },
    });
  }
}
