import { Injectable } from '@angular/core';
import {
  loginResponseSchema,
  meResponseSchema,
  type LoginRequest,
  type LoginResponse,
  type MeResponse,
} from '@peertoreel/contracts';
import type { Observable } from 'rxjs';
import { BaseApiService } from '../../../core/api/base-api.service';

@Injectable({ providedIn: 'root' })
export class AuthApiService extends BaseApiService {
  login(credentials: LoginRequest): Observable<LoginResponse> {
    return this.post('/auth/login', credentials, loginResponseSchema);
  }

  logout(): Observable<void> {
    return this.postVoid('/auth/logout');
  }

  me(): Observable<MeResponse> {
    return this.get('/auth/me', meResponseSchema);
  }
}
