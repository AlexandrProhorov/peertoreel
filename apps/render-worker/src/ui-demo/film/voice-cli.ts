import { spawn } from 'node:child_process';
import { config as loadEnv } from 'dotenv';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  synthesizeGoogleTts,
  synthesizeWithTimestamps,
  TtsError,
} from '@peertoreel/providers';
import { uiEpisodeSchema, type UiEpisode } from '../spec.js';
import {
  cuesFromWords,
  estimateWords,
  toSrt,
  wordsFromAlignment,
  type Cue,
  type SpokenWord,
} from './voice.js';

/**
 * Voice step: one TTS call per scene, then the picture is retimed to the voice.
 *
 * ElevenLabs gives character alignment, so its word times are exact. Google
 * Translate TTS is the free fallback and has no alignment: word times are
 * distributed over the measured audio and marked `estimated` in the manifest.
 * A quota error is terminal and names the switch — there is no silent failover.
 *
 *   ui:voice --input out/film/episode.json --out out/film/voice [--provider elevenlabs|google]
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

function probeDuration(file: string): Promise<number> {
  const binary = process.env['FFPROBE_BIN'] ?? 'ffprobe';

  return new Promise((resolve, reject) => {
    const child = spawn(binary, [
      '-v',
      'error',
      '-show_entries',
      'format=duration',
      '-of',
      'default=nw=1:nk=1',
      file,
    ]);
    let output = '';

    child.stdout.on('data', (chunk: Buffer) => {
      output = `${output}${chunk.toString()}`;
    });
    child.on('error', reject);
    child.on('close', (code) => {
      const seconds = Number(output.trim());

      if (code !== 0 || !Number.isFinite(seconds)) {
        reject(new Error(`ffprobe could not read ${path.basename(file)}`));

        return;
      }

      resolve(seconds);
    });
  });
}

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

  const provider = (optionValue('--provider') ?? 'elevenlabs') as 'elevenlabs' | 'google';
  const apiKey = process.env['ELEVENLABS_API_KEY'];
  const voiceId = optionValue('--voice-id') ?? process.env['ELEVENLABS_VOICE_ID'];
  const modelId = process.env['ELEVENLABS_MODEL_ID'] ?? 'eleven_multilingual_v2';

  if (provider === 'elevenlabs') {
    if (apiKey === undefined || apiKey.length === 0) {
      throw new Error('ELEVENLABS_API_KEY is missing');
    }

    if (voiceId === undefined || voiceId.length === 0) {
      throw new Error('ELEVENLABS_VOICE_ID is missing (or pass --voice-id)');
    }
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

    const file = `scene-${index + 1}.mp3`;
    let words: SpokenWord[];
    let audioSec: number;

    if (provider === 'google') {
      const audio = await synthesizeGoogleTts(narration, { language: 'ru' });

      await writeFile(path.join(outDir, file), audio);
      audioSec = await probeDuration(path.join(outDir, file));
      words = estimateWords(narration, audioSec);
    } else {
      let result;

      try {
        result = await synthesizeWithTimestamps({ text: narration, voiceId: voiceId ?? '', modelId, apiKey: apiKey ?? '' });
      } catch (error: unknown) {
        if (error instanceof TtsError && /quota/i.test(error.message)) {
          throw new Error(
            'квота ElevenLabs исчерпана; повторите с --provider google (бесплатный, тайминги оценочные)',
          );
        }

        throw error;
      }

      await writeFile(path.join(outDir, file), result.audio);
      words = wordsFromAlignment(narration, result.alignment);
      audioSec = words.at(-1)?.end ?? 0;
    }

    const durationSec = Number(
      Math.min(20, Math.max(scene.durationSec, audioSec + AUDIO_TAIL)).toFixed(2),
    );

    scenes[index] = { ...scene, durationSec };
    voices.push({
      index: index + 1,
      file,
      audioSec: Number(audioSec.toFixed(2)),
      startSec: Number(cursor.toFixed(2)),
      durationSec,
    });
    cues.push(...cuesFromWords(words, cursor));
    cursor += durationSec;

    console.log(`scene ${index + 1}: ${audioSec.toFixed(2)}s voice, ${durationSec}s scene`);
  }

  const voiced: UiEpisode = { ...episode, scenes };

  await writeFile(path.join(outDir, 'episode.json'), `${JSON.stringify(voiced, null, 2)}\n`, 'utf8');
  await writeFile(path.join(outDir, 'subtitles.srt'), toSrt(cues), 'utf8');
  await writeFile(
    path.join(outDir, 'manifest.json'),
    `${JSON.stringify(
      {
        input: path.relative(cwd, inputPath),
        provider,
        alignment: provider === 'google' ? 'estimated' : 'exact',
        totalSec: Number(cursor.toFixed(2)),
        scenes: voices,
        subtitles: 'subtitles.srt',
      },
      null,
      2,
    )}\n`,
    'utf8',
  );

  console.log(`voice: ${voices.length} scene(s), ${cursor.toFixed(1)}s, ${provider} -> ${outDir}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
