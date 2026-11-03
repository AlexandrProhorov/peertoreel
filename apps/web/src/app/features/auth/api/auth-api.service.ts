import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import {
  loginResponseSchema,
  meResponseSchema,
  type LoginRequest,
  type LoginResponse,
  type MeResponse,
} from '@kadence/contracts';
import { map, type Observable } from 'rxjs';
import { API_BASE_URL } from '../../../core/config/api.config';

@Injectable({ providedIn: 'root' })
export class AuthApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(API_BASE_URL);

  login(credentials: LoginRequest): Observable<LoginResponse> {
    return this.http
      .post<LoginResponse>(`${this.baseUrl}/auth/login`, credentials, {
        withCredentials: true,
      })
      .pipe(map((data) => loginResponseSchema.parse(data)));
  }

  logout(): Observable<void> {
    return this.http.post<void>(`${this.baseUrl}/auth/logout`, null, {
      withCredentials: true,
    });
  }

  me(): Observable<MeResponse> {
    return this.http
      .get<MeResponse>(`${this.baseUrl}/auth/me`, { withCredentials: true })
      .pipe(map((data) => meResponseSchema.parse(data)));
  }
}
