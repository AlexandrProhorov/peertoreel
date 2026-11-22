/**
 * Free Google Translate TTS: the fallback of the voice pipeline when ElevenLabs
 * quota is exhausted (ADR/worker §TTS). No word alignment exists, so the caller
 * distributes word times over the measured audio duration — a best-effort
 * approximation that must stay labelled as such in the manifest.
 */

const GOOGLE_TTS_URL = 'https://translate.google.com/translate_tts';
const MAX_CHUNK_CHARS = 180;

export interface GoogleTtsOptions {
  readonly language?: string;
  readonly fetchImpl?: typeof fetch;
}

export class GoogleTtsError extends Error {
  readonly retryable: boolean;

  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'GoogleTtsError';
    this.retryable = status === 0 || status === 429 || status >= 500;
  }
}

/** Split narration at word boundaries; every chunk stays under the URL limit. */
export function splitForGoogleTts(text: string, maxLength = MAX_CHUNK_CHARS): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const chunks: string[] = [];
  let current = '';

  for (const word of words) {
    const candidate = current.length === 0 ? word : `${current} ${word}`;

    if (candidate.length <= maxLength) {
      current = candidate;

      continue;
    }

    if (current.length > 0) {
      chunks.push(current);
    }

    current = word;
  }

  if (current.length > 0) {
    chunks.push(current);
  }

  return chunks;
}

/** MP3 frames concatenate: the caller gets one buffer for the whole narration. */
export async function synthesizeGoogleTts(
  text: string,
  options: GoogleTtsOptions = {},
): Promise<Buffer> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const language = options.language ?? 'ru';
  const chunks = splitForGoogleTts(text);

  if (chunks.length === 0) {
    throw new GoogleTtsError('Google TTS got empty text', 400);
  }

  const parts: Buffer[] = [];

  for (const chunk of chunks) {
    const url = `${GOOGLE_TTS_URL}?ie=UTF-8&client=tw-ob&tl=${language}&q=${encodeURIComponent(chunk)}`;
    const response = await fetchImpl(url, {
      headers: {
        /* The endpoint is public but expects a browser-like client. */
        'user-agent': 'Mozilla/5.0 (compatible; PeerToReel/0.1)',
        referer: 'https://translate.google.com/',
      },
    });

    if (!response.ok) {
      const detail = (await response.text()).slice(0, 200);

      throw new GoogleTtsError(
        `Google TTS responded with ${response.status}: ${detail}`,
        response.status,
      );
    }

    const body = Buffer.from(await response.arrayBuffer());

    if (body.length === 0) {
      throw new GoogleTtsError('Google TTS returned no audio', response.status);
    }

    parts.push(body);
  }

  return Buffer.concat(parts);
}
