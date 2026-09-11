import { Injectable, inject, signal } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, tap } from 'rxjs';

interface SessionResponse {
  data: { token: string; expiresAt: string; mustChangePassword?: boolean };
}

interface MeResponse {
  data: { email: string; mustChangePassword: boolean };
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly TOKEN_KEY = 'vlt_admin_token';

  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);

  readonly isLoggedIn = signal(!!localStorage.getItem(this.TOKEN_KEY));

  /**
   * Gilt noch das verteilte Startpasswort?
   *
   * Nur ein Merker fuer die Oberflaeche – durchgesetzt wird die Sperre in der
   * API: solange das Passwort nicht gewechselt ist, weist sie unter
   * /api/admin/ alles mit 403 ab. Hier steht sie, damit der Benutzer gleich
   * auf der richtigen Seite landet statt vor einer Fehlermeldung.
   */
  readonly mustChangePassword = signal(false);

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

  private keepSession(token: string, mustChange: boolean): void {
    localStorage.setItem(this.TOKEN_KEY, token);
    this.isLoggedIn.set(true);
    this.mustChangePassword.set(mustChange);
  }

  login(email: string, password: string): Observable<SessionResponse> {
    return this.http.post<SessionResponse>('/api/auth/login', { email, password }).pipe(
      tap((res) => this.keepSession(res.data.token, res.data.mustChangePassword === true)),
    );
  }

  verifyToken(): Observable<MeResponse> {
    return this.http.get<MeResponse>('/api/auth/me', { headers: this.authHeaders() }).pipe(
      // Beim Neuladen der Seite ist der Merker weg – die API weiss es noch.
      tap((res) => this.mustChangePassword.set(res.data.mustChangePassword === true)),
    );
  }

  /**
   * Setzt ein neues Passwort. Die API gibt ein frisches Token zurueck: sie
   * verwirft beim Wechsel alle bisherigen, damit fremde Sitzungen enden.
   * Ohne das Token hier zu uebernehmen waere man nach dem Wechsel abgemeldet.
   */
  changePassword(currentPassword: string, newPassword: string): Observable<SessionResponse> {
    return this.http
      .post<SessionResponse>(
        '/api/auth/password',
        { currentPassword, newPassword },
        { headers: this.authHeaders() },
      )
      .pipe(tap((res) => this.keepSession(res.data.token, false)));
  }

  logout(): void {
    const token = this.getToken();
    if (token) {
      this.http
        .post('/api/auth/logout', {}, { headers: this.authHeaders() })
        .subscribe({ error: () => undefined });
    }
    localStorage.removeItem(this.TOKEN_KEY);
    this.isLoggedIn.set(false);
    this.mustChangePassword.set(false);
    this.router.navigate(['/admin/login']);
  }
}
