import { Injectable, signal } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Router } from '@angular/router';
import { tap } from 'rxjs';

interface LoginResponse {
  data: { token: string; expiresAt: string };
}

interface MeResponse {
  data: { email: string };
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly TOKEN_KEY = 'vlt_admin_token';

  readonly isLoggedIn = signal(!!localStorage.getItem(this.TOKEN_KEY));

  constructor(private http: HttpClient, private router: Router) {}

  getToken(): string | null {
    return localStorage.getItem(this.TOKEN_KEY);
  }

  /**
   * Eigener Header statt Authorization: laeuft PHP auf dem Server als CGI,
   * reicht Apache den Authorization-Header nicht an PHP durch. Ein X-Header
   * kommt dagegen zuverlaessig an.
   */
  private authHeaders(): HttpHeaders {
    return new HttpHeaders({ 'X-Auth-Token': this.getToken() ?? '' });
  }

  login(email: string, password: string) {
    return this.http.post<LoginResponse>('/api/auth/login', { email, password }).pipe(
      tap((res) => {
        localStorage.setItem(this.TOKEN_KEY, res.data.token);
        this.isLoggedIn.set(true);
      }),
    );
  }

  verifyToken() {
    return this.http.get<MeResponse>('/api/auth/me', { headers: this.authHeaders() });
  }

  logout(): void {
    const token = this.getToken();
    if (token) {
      this.http
        .post('/api/auth/logout', {}, { headers: this.authHeaders() })
        .subscribe({ error: () => {} });
    }
    localStorage.removeItem(this.TOKEN_KEY);
    this.isLoggedIn.set(false);
    this.router.navigate(['/admin/login']);
  }
}
