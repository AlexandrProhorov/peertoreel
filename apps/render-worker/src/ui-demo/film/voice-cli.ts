import { config as loadEnv } from 'dotenv';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { synthesizeWithTimestamps } from '@peertoreel/providers';
import { uiEpisodeSchema, type UiEpisode } from '../spec.js';
import { cuesFromWords, toSrt, wordsFromAlignment, type Cue } from './voice.js';

/**
 * Voice step: one TTS call per scene, then the picture is retimed to the voice.
 *
 * The scene is at least as long as its narration plus a short tail. A subtitle
 * that drifts from the audio is worse than none, so the SRT is built from the
 * provider's character alignment and the same scene offsets the renderer uses.
 *
 *   ui:voice --input out/film/episode.json --out out/film/voice [--voice-id <id>]
 */

function optionValue(name: string): string | undefined {
  const inline = process.argv.find((argument) => argument.startsWith(`${name}=`));

  if (inline !== undefined) {
    return inline.slice(name.length + 1);
  }

  const index = process.argv.indexOf(name);

  return index < 0 ? undefined : process.argv[index + 1];
}

interface SceneVoice {
  readonly index: number;
  readonly file: string;
  readonly audioSec: number;
  readonly startSec: number;
  readonly durationSec: number;
}

const AUDIO_TAIL = 0.35;

async function main(): Promise<void> {
  loadEnv({
    path: fileURLToPath(new URL('../../../../../.env', import.meta.url)),
    quiet: true,
  });

  const cwd = process.cwd();
  const input = optionValue('--input');

  if (input === undefined) {
    throw new Error('--input <episode.json> is required');
  }

  const apiKey = process.env['ELEVENLABS_API_KEY'];
  const voiceId = optionValue('--voice-id') ?? process.env['ELEVENLABS_VOICE_ID'];
  const modelId = process.env['ELEVENLABS_MODEL_ID'] ?? 'eleven_multilingual_v2';

  if (apiKey === undefined || apiKey.length === 0) {
    throw new Error('ELEVENLABS_API_KEY is missing');
  }

  if (voiceId === undefined || voiceId.length === 0) {
    throw new Error('ELEVENLABS_VOICE_ID is missing (or pass --voice-id)');
  }

  const inputPath = path.resolve(cwd, input);
  const outDir = path.resolve(cwd, optionValue('--out') ?? path.join(path.dirname(inputPath), 'voice'));
  const episode = uiEpisodeSchema.parse(JSON.parse(await readFile(inputPath, 'utf8')));
  const scenes = [...episode.scenes];
  const voices: SceneVoice[] = [];
  const cues: Cue[] = [];
  let cursor = 0;

  await mkdir(outDir, { recursive: true });

  for (let index = 0; index < scenes.length; index += 1) {
    const scene = scenes[index];

    if (scene === undefined) {
      continue;
    }

    const narration = scene.narration;

    if (narration === undefined) {
      throw new Error(`scene ${index + 1} has no narration: run the arc with narration first`);
    }

    const result = await synthesizeWithTimestamps({ text: narration, voiceId, modelId, apiKey });
    const file = `scene-${index + 1}.mp3`;

    await writeFile(path.join(outDir, file), result.audio);

    const words = wordsFromAlignment(narration, result.alignment);
    const audioSec = words.at(-1)?.end ?? 0;
    const durationSec = Number(
      Math.min(20, Math.max(scene.durationSec, audioSec + AUDIO_TAIL)).toFixed(2),
    );

    scenes[index] = { ...scene, durationSec };
    voices.push({ index: index + 1, file, audioSec: Number(audioSec.toFixed(2)), startSec: Number(cursor.toFixed(2)), durationSec });
    cues.push(...cuesFromWords(words, cursor));
    cursor += durationSec;

    console.log(`scene ${index + 1}: ${audioSec.toFixed(2)}s voice, ${durationSec}s scene`);
  }

  const voiced: UiEpisode = { ...episode, scenes };
  const srtPath = path.join(outDir, 'subtitles.srt');

  await writeFile(path.join(outDir, 'episode.json'), `${JSON.stringify(voiced, null, 2)}\n`, 'utf8');
  await writeFile(srtPath, toSrt(cues), 'utf8');
  await writeFile(
    path.join(outDir, 'manifest.json'),
    `${JSON.stringify({ input: path.relative(cwd, inputPath), totalSec: Number(cursor.toFixed(2)), scenes: voices, subtitles: 'subtitles.srt' }, null, 2)}\n`,
    'utf8',
  );

  console.log(`voice: ${voices.length} scene(s), ${cursor.toFixed(1)}s -> ${outDir}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
