import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorkerEnv } from '../config/env.js';
import { synthesizeWithGoogleTts } from '../storyboard/tts-fallback.js';
import { synthesizeWithTimestamps, TtsError } from '../tts/elevenlabs.js';
import type { StageDeps } from './context.js';
import { synthesizeVoiceover } from './voiceover.processor.js';

vi.mock('../storyboard/tts-fallback.js', () => ({
  synthesizeWithGoogleTts: vi.fn(),
}));

vi.mock('../tts/elevenlabs.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../tts/elevenlabs.js')>();

  return { ...actual, synthesizeWithTimestamps: vi.fn() };
});

const runId = '11111111-1111-4111-8111-111111111111';

function deps(): StageDeps<WorkerEnv> {
  return {
    env: {
      FFMPEG_BIN: 'ffmpeg',
      FFPROBE_BIN: 'ffprobe',
      ELEVENLABS_API_KEY: 'key',
      ELEVENLABS_VOICE_ID: 'voice',
      ELEVENLABS_MODEL_ID: 'model',
    },
  } as unknown as StageDeps<WorkerEnv>;
}

describe('voiceover provider', () => {
  beforeEach(() => {
    vi.mocked(synthesizeWithTimestamps).mockReset();
    vi.mocked(synthesizeWithGoogleTts).mockReset();
  });

  it('turns an exhausted ElevenLabs quota into an actionable terminal error', async () => {
    vi.mocked(synthesizeWithTimestamps).mockRejectedValue(
      new TtsError('ElevenLabs responded with 401: quota_exceeded', 401, false),
    );

    await expect(
      synthesizeVoiceover({
        runId,
        provider: 'elevenlabs',
        scenes: ['Текст сцены'],
        speech: 'Текст сцены',
        deps: deps(),
      }),
    ).rejects.toMatchObject({
      name: 'TtsError',
      retryable: false,
      message: expect.stringContaining('Google TTS'),
    });
  });

  it('uses Google TTS when the run asks for it and never calls ElevenLabs', async () => {
    vi.mocked(synthesizeWithGoogleTts).mockImplementation(async (options) => {
      await mkdir(options.workDir, { recursive: true });
      await writeFile(path.join(options.workDir, 'voiceover.mp3'), 'mp3-bytes');

      return {
        provider: 'google-translate-spike',
        model: 'google-translate:ru',
        words: [{ text: 'Сцена', startSec: 0, endSec: 0.5 }],
        audioDurationSec: 0.5,
        sceneDurationsSec: [0.5],
        characters: 10,
        bytes: 9,
      };
    });

    const voice = await synthesizeVoiceover({
      runId,
      provider: 'google',
      scenes: ['Сцена'],
      speech: 'Сцена',
      deps: deps(),
    });

    expect(voice.audio.toString('utf8')).toBe('mp3-bytes');
    expect(voice.words).toHaveLength(1);
    expect(synthesizeWithTimestamps).not.toHaveBeenCalled();
  });
});
