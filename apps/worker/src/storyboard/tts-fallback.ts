import { mkdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { DerivedWord } from '@peertoreel/contracts';
import { probeMedia } from '../media/ffprobe.js';
import { runFfmpeg } from '../media/ffmpeg.js';

/**
 * Spike-only TTS fallback for M3.5 when the ElevenLabs quota is exhausted.
 * It is CLI-only: the production voiceover stage keeps using ElevenLabs.
 *
 * Google Translate TTS has no word alignment, so scene durations are exact
 * (one probe per scene) and word times are allocated proportionally to word
 * length inside each scene. Recipe layers do not depend on word times; ASS
 * karaoke uses them as a best-effort approximation.
 */
export const GOOGLE_TTS_PROVIDER = 'google-translate-spike' as const;

const GOOGLE_TTS_URL = 'https://translate.google.com/translate_tts';
const MAX_CHUNK_CHARS = 180;
const REQUEST_DELAY_MS = 250;
const MAX_ATTEMPTS = 3;

export interface GoogleTtsOptions {
  scenes: readonly string[];
  workDir: string;
  ffmpegBin: string;
  ffprobeBin: string;
  language?: string;
}

export interface GoogleTtsResult {
  provider: typeof GOOGLE_TTS_PROVIDER;
  model: string;
  words: DerivedWord[];
  audioDurationSec: number;
  sceneDurationsSec: number[];
  characters: number;
  bytes: number;
}

export class GoogleTtsError extends Error {
  /** Lets the worker convert a 4xx into an UnrecoverableError. */
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

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/** Split narration at word boundaries; every chunk stays under the URL limit. */
export function splitForTts(
  text: string,
  maxLength = MAX_CHUNK_CHARS,
): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const chunks: string[] = [];
  let current = '';

  for (const word of words) {
    if (word.length > maxLength) {
      if (current.length > 0) {
        chunks.push(current);
        current = '';
      }

      for (let index = 0; index < word.length; index += maxLength) {
        chunks.push(word.slice(index, index + maxLength));
      }

      continue;
    }

    const candidate = current.length === 0 ? word : `${current} ${word}`;

    if (candidate.length > maxLength) {
      if (current.length > 0) {
        chunks.push(current);
      }

      current = word;
      continue;
    }

    current = candidate;
  }

  if (current.length > 0) {
    chunks.push(current);
  }

  return chunks;
}

/**
 * Allocate word times inside `[startSec, startSec + durationSec)`, weighted by
 * word length (longer words take proportionally longer to pronounce).
 */
export function allocateWordTimings(
  text: string,
  startSec: number,
  durationSec: number,
): DerivedWord[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const weights = words.map((word) => Math.max(1, word.length));
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);

  if (words.length === 0 || totalWeight === 0) {
    return [];
  }

  let cursor = startSec;

  return words.map((word, index) => {
    const weight = weights[index] ?? 1;
    const span = (weight / totalWeight) * durationSec;
    const wordStart = cursor;
    const wordEnd = wordStart + span;

    cursor = wordEnd;

    return {
      text: word,
      startSec: Math.round(wordStart * 1000) / 1000,
      endSec: Math.round(wordEnd * 1000) / 1000,
    };
  });
}

async function fetchChunk(
  text: string,
  language: string,
  fetchImpl: typeof fetch,
): Promise<Buffer> {
  const params = new URLSearchParams({
    ie: 'UTF-8',
    client: 'tw-ob',
    tl: language,
    q: text,
  });
  let lastError: unknown = new Error('Google TTS returned no audio');

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const response = await fetchImpl(`${GOOGLE_TTS_URL}?${params.toString()}`, {
      headers: {
        'user-agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36',
        referer: 'https://translate.google.com/',
      },
    });

    if (response.ok) {
      const body = Buffer.from(await response.arrayBuffer());
      const firstByte = body[0];

      if (
        body.byteLength > 0 &&
        (firstByte === 0x49 || firstByte === 0xff)
      ) {
        return body;
      }

      lastError = new GoogleTtsError(
        'Google TTS returned a non-MP3 body',
        200,
      );
    } else {
      const detail = (await response.text()).slice(0, 200);

      lastError = new GoogleTtsError(
        `Google TTS responded with ${response.status}: ${detail}`,
        response.status,
      );
    }

    if (attempt < MAX_ATTEMPTS) {
      await delay(500 * attempt);
    }
  }

  throw lastError;
}

/** Synthesize every scene separately, then concatenate into one voiceover. */
export async function synthesizeWithGoogleTts(
  options: GoogleTtsOptions,
  fetchImpl: typeof fetch = fetch,
): Promise<GoogleTtsResult> {
  const language = options.language ?? 'ru';
  const ttsDir = path.join(options.workDir, 'tts');
  const sceneDurationsSec: number[] = [];
  const characters = options.scenes.reduce(
    (sum, scene) => sum + scene.length,
    0,
  );

  await mkdir(ttsDir, { recursive: true });

  for (let index = 0; index < options.scenes.length; index += 1) {
    const scene = options.scenes[index] ?? '';
    const chunks = splitForTts(scene);
    const buffers: Buffer[] = [];

    for (const chunk of chunks) {
      buffers.push(await fetchChunk(chunk, language, fetchImpl));
      await delay(REQUEST_DELAY_MS);
    }

    const scenePath = path.join(ttsDir, `scene-${index}.mp3`);

    await writeFile(scenePath, Buffer.concat(buffers));

    const probe = await probeMedia(scenePath, {
      workDir: options.workDir,
      ffprobeBin: options.ffprobeBin,
    });

    sceneDurationsSec.push(probe.durationSec);
  }

  const list = `${options.scenes
    .map((_, index) => `file 'scene-${index}.mp3'`)
    .join('\n')}\n`;
  const listPath = path.join(options.workDir, 'tts', 'scenes.txt');

  await writeFile(listPath, list, 'utf8');
  await runFfmpeg(
    [
      '-hide_banner',
      '-y',
      '-f',
      'concat',
      '-safe',
      '0',
      '-i',
      'tts/scenes.txt',
      '-c:a',
      'libmp3lame',
      '-b:a',
      '128k',
      'voiceover.mp3',
    ],
    { workDir: options.workDir, ffmpegBin: options.ffmpegBin },
  );

  const fullProbe = await probeMedia('voiceover.mp3', {
    workDir: options.workDir,
    ffprobeBin: options.ffprobeBin,
  });
  const voiceoverStat = await stat(path.join(options.workDir, 'voiceover.mp3'));
  const rawTotal = sceneDurationsSec.reduce((sum, value) => sum + value, 0);
  const scale = rawTotal > 0 ? fullProbe.durationSec / rawTotal : 1;
  const words: DerivedWord[] = [];
  let cursor = 0;

  options.scenes.forEach((scene, index) => {
    const duration = (sceneDurationsSec[index] ?? 0) * scale;

    words.push(...allocateWordTimings(scene, cursor, duration));
    cursor += duration;
  });

  return {
    provider: GOOGLE_TTS_PROVIDER,
    model: `google-translate:${language}`,
    words,
    audioDurationSec: fullProbe.durationSec,
    sceneDurationsSec: sceneDurationsSec.map((duration) => duration * scale),
    characters,
    bytes: voiceoverStat.size,
  };
}
