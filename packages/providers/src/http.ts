/**
 * Injected HTTP boundary (M3.6b.1).
 *
 * Adapters build a request and parse a response; they never own a socket.
 * Tests pass a fake client, production passes `createFetchHttpClient`.
 *
 * `body` is UTF-8 text (JSON/SVG); `bodyBase64` carries the same payload bytes
 * so raster adapters never depend on a lossy text round-trip.
 */

export interface HttpRequest {
  readonly method: 'GET' | 'POST';
  readonly url: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly body?: string;
}

export interface HttpResponse {
  readonly status: number;
  readonly body: string;
  /** Raw payload bytes as base64; required by raster adapters. */
  readonly bodyBase64?: string;
  readonly contentType?: string;
}

export type HttpClient = (request: HttpRequest) => Promise<HttpResponse>;

/** Thin `fetch` adapter; kept out of the request builders for testability. */
export function createFetchHttpClient(
  fetchImpl: typeof fetch = fetch,
): HttpClient {
  return async (request) => {
    const response = await fetchImpl(request.url, {
      method: request.method,
      headers: request.headers,
      body: request.body,
    });
    const bytes = new Uint8Array(await response.arrayBuffer());

    return {
      status: response.status,
      body: new TextDecoder().decode(bytes),
      bodyBase64: Buffer.from(bytes).toString('base64'),
      contentType: response.headers.get('content-type') ?? undefined,
    };
  };
}
