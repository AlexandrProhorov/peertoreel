import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map, type Observable } from 'rxjs';
import { API_BASE_URL } from '../config/api.config';

/**
 * Structural subset of a Zod schema. Keeps the transport layer independent of
 * the contracts package: any object with `parse` fits.
 */
export interface ResponseSchema<T> {
  parse(input: unknown): T;
}

/**
 * Shared HTTP transport: base URL, credentials and response validation.
 * Owns no state, cache, retries or user-facing messages.
 */
@Injectable()
export abstract class BaseApiService {
  protected readonly http = inject(HttpClient);
  protected readonly baseUrl = inject(API_BASE_URL);

  protected url(path: string): string {
    return `${this.baseUrl}${path}`;
  }

  protected get<T>(path: string, schema: ResponseSchema<T>): Observable<T> {
    return this.http
      .get<unknown>(this.url(path), { withCredentials: true })
      .pipe(map((data) => schema.parse(data)));
  }

  protected post<T>(path: string, body: unknown, schema: ResponseSchema<T>): Observable<T> {
    return this.http
      .post<unknown>(this.url(path), body, { withCredentials: true })
      .pipe(map((data) => schema.parse(data)));
  }

  protected postVoid(path: string, body: unknown = null): Observable<void> {
    return this.http.post<void>(this.url(path), body, {
      withCredentials: true,
    });
  }
}
