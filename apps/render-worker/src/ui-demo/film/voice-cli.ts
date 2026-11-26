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
import { SCENE_FPS } from '../../video-target.js';
import {
  uiEpisodeSchema,
  uiSceneFrames,
  type UiEpisode,
  type UiScene,
} from '../spec.js';
import { alignSceneToLines } from './scene-lines.js';
import { alignDrawToLines, alignTextBeats } from '../draw/align.js';
import {
  estimateWords,
  placeLines,
  splitNarrationLines,
  wordsFromAlignment,
  MAX_LINE_CHARS,
  type LineCue,
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
  /** Scene boundary in video frames; the mux offsets audio from this, not seconds. */
  readonly frameStart: number;
  /** Scene-local line starts: the same numbers that built the audio. */
  readonly lines: readonly LineCue[];
}

/* The line audio is trimmed, so the tail is only the beat after the last word. */
const AUDIO_TAIL = 0.25;
const AUDIO_RATE = 24000;
const AUDIO_BITRATE = '64k';
/**
 * Line durations are quantized to 20 ms. ffprobe jitters by a millisecond
 * between runs, and an unquantized cue list made a repeated run differ by
 * ±10 ms — enough to fail an honest idempotency check.
 */
const LINE_QUANTUM_SEC = 0.02;

function quantizeLineSec(value: number): number {
  return Math.round(Math.round(value / LINE_QUANTUM_SEC) * LINE_QUANTUM_SEC * 1000) / 1000;
}

/**
 * Remove the silence Google puts around every response. The trailing silence
 * reached 0.9 s and was then counted as speech, stretching word times; the
 * leading 0.1 s put the line on screen before its voice.
 */
const TRIM_SILENCE =
  'silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.02,' +
  'areverse,silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.02,areverse';

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function runFfmpeg(args: readonly string[]): Promise<void> {
  const binary = process.env['FFMPEG_BIN'] ?? 'ffmpeg';

  return new Promise((resolve, reject) => {
    const child = spawn(binary, [...args], { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';

    child.stderr.on('data', (chunk: Buffer) => {
      stderr = `${stderr}${chunk.toString()}`.slice(-2000);
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve();

        return;
      }

      reject(new Error(`ffmpeg exited with ${String(code)}: ${stderr}`));
    });
  });
}

/** Trim one synthesized line; empty or all-silence audio keeps its raw form. */
async function trimLine(input: string, output: string): Promise<number> {
  try {
    await runFfmpeg([
      '-y',
      '-v',
      'error',
      '-i',
      input,
      '-af',
      TRIM_SILENCE,
      '-ar',
      String(AUDIO_RATE),
      '-ac',
      '1',
      '-c:a',
      'libmp3lame',
      '-b:a',
      AUDIO_BITRATE,
      output,
    ]);

    const duration = await probeDuration(output);

    if (duration >= 0.05) {
      return duration;
    }
  } catch {
    /* Fall through to the raw transcode: a line must never disappear. */
  }

  await runFfmpeg([
    '-y',
    '-v',
    'error',
    '-i',
    input,
    '-ar',
    String(AUDIO_RATE),
    '-ac',
    '1',
    '-c:a',
    'libmp3lame',
    '-b:a',
    AUDIO_BITRATE,
    output,
  ]);

  return probeDuration(output);
}

/** Assemble the scene track from its lines at the exact cue offsets. */
async function assembleScene(
  files: readonly string[],
  cues: readonly LineCue[],
  output: string,
): Promise<void> {
  if (files.length === 0) {
    throw new Error('assembleScene: no line audio');
  }

  if (files.length === 1) {
    await runFfmpeg([
      '-y',
      '-v',
      'error',
      '-i',
      files[0] ?? '',
      '-ar',
      String(AUDIO_RATE),
      '-ac',
      '1',
      '-c:a',
      'libmp3lame',
      '-b:a',
      AUDIO_BITRATE,
      output,
    ]);

    return;
  }

  const args: string[] = ['-y', '-v', 'error'];

  for (const file of files) {
    args.push('-i', file);
  }

  const delays = files.map((_, index) => {
    const ms = Math.round((cues[index]?.startSec ?? 0) * 1000);

    return `[${index}:a]adelay=${ms}|${ms}[a${index}]`;
  });
  const mixed = files.map((_, index) => `[a${index}]`).join('');

  args.push(
    '-filter_complex',
    `${delays.join(';')};${mixed}amix=inputs=${files.length}:duration=longest:normalize=0[aout]`,
    '-map',
    '[aout]',
    '-ar',
    String(AUDIO_RATE),
    '-ac',
    '1',
    '-c:a',
    'libmp3lame',
    '-b:a',
    AUDIO_BITRATE,
    output,
  );

  await runFfmpeg(args);
}

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
  const speeches: UiEpisode['speech'] = [];
  let cursor = 0;
  let frameCursor = 0;

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

    const lines = splitNarrationLines(
      narration,
      scene.device === 'draw' ? 200 : MAX_LINE_CHARS,
    );

    if (lines.length === 0) {
      throw new Error(`scene ${index + 1} has empty narration`);
    }

    const lineDir = path.join(outDir, 'lines', `scene-${index + 1}`);
    await mkdir(lineDir, { recursive: true });

    const files: string[] = [];
    const durations: number[] = [];
    /* ElevenLabs alignment is relative to its own line; the trim keeps the
       speech start at the file start, so the same offset still holds. */
    const alignedWords: SpokenWord[][] = [];

    for (const [lineIndex, line] of lines.entries()) {
      const raw = path.join(lineDir, `line-${lineIndex + 1}-raw.mp3`);
      const trimmed = path.join(lineDir, `line-${lineIndex + 1}.mp3`);
      let audio: Buffer;
      let words: SpokenWord[] | null = null;

      if (provider === 'google') {
        audio = await synthesizeGoogleTts(line.text, { language: 'ru' });
      } else {
        let result;

        try {
          result = await synthesizeWithTimestamps({
            text: line.text,
            voiceId: voiceId ?? '',
            modelId,
            apiKey: apiKey ?? '',
          });
        } catch (error: unknown) {
          if (error instanceof TtsError && /quota/i.test(error.message)) {
            throw new Error(
              'квота ElevenLabs исчерпана; повторите с --provider google (бесплатный, тайминги оценочные)',
            );
          }

          throw error;
        }

        audio = result.audio;
        words = wordsFromAlignment(line.text, result.alignment);
      }

      await writeFile(raw, audio);
      durations.push(quantizeLineSec(await trimLine(raw, trimmed)));
      alignedWords.push(words ?? []);
      files.push(trimmed);
    }

    const placement = placeLines(lines, durations);
    const file = `scene-${index + 1}.mp3`;
    await assembleScene(files, placement.cues, path.join(outDir, file));

    /* The cue list is the timing source: probing the encoded file added a
       millisecond of jitter between identical runs. */
    const probed = await probeDuration(path.join(outDir, file));

    if (Math.abs(probed - placement.totalSec) > 0.2) {
      console.warn(
        `scene ${index + 1}: audio ${probed.toFixed(2)}s differs from cue list ` +
          `${placement.totalSec.toFixed(2)}s`,
      );
    }

    const audioSec = placement.totalSec;
    const words: SpokenWord[] = [];
    const lineWordsByIdx: SpokenWord[][] = [];

    for (const [lineIndex, cue] of placement.cues.entries()) {
      const lineWords =
        provider === 'google'
          ? estimateWords(cue.text, cue.endSec - cue.startSec)
          : (alignedWords[lineIndex] ?? []);

      lineWordsByIdx.push(lineWords);

      for (const word of lineWords) {
        words.push({
          word: word.word,
          start: round3(cue.startSec + word.start),
          end: round3(cue.startSec + word.end),
        });
      }
    }

    const durationSec = Number(
      Math.min(20, Math.max(scene.durationSec, audioSec + AUDIO_TAIL)).toFixed(2),
    );
    const voicedScene: UiScene = {
      ...scene,
      durationSec,
      narrationLines: [...placement.cues],
    };
    /* The scene's text elements are the script: put the measured line in each
       one and show it exactly when the line is spoken. */
    let finalScene: UiScene = voicedScene;

    if (voicedScene.device === 'spec') {
      const alignment = alignSceneToLines(voicedScene, placement.cues, lineWordsByIdx, {
        /* A fallback keeps its one label: it cannot carry every line. */
        requireAll: voicedScene.fallback === undefined,
      });

      if (!alignment.aligned) {
        console.warn(
          `scene ${index + 1}: the design has ${alignment.reasons.join('; ')} — ` +
            'the text stays as the model wrote it',
        );
      }

      finalScene = alignment.aligned ? alignment.scene : voicedScene;
    } else if (voicedScene.device === 'draw') {
      const alignment =
        voicedScene.textBeats === undefined
          ? alignDrawToLines(voicedScene, placement.cues, lineWordsByIdx)
          : alignTextBeats(voicedScene, words);

      if (!alignment.aligned) {
        console.warn(
          `scene ${index + 1}: ${alignment.reasons.join('; ')} — ` +
            'the text keeps its authored beat',
        );
      }

      finalScene = alignment.scene;
    }

    scenes[index] = finalScene;

    voices.push({
      index: index + 1,
      file,
      audioSec: Number(audioSec.toFixed(2)),
      startSec: Number(cursor.toFixed(2)),
      durationSec,
      frameStart: frameCursor,
      lines: placement.cues,
    });
    speeches.push({
      sceneId: scene.id,
      words: words.map((word) => ({
        text: word.word,
        startSec: round3(word.start),
        endSec: round3(word.end),
      })),
    });

    console.log(
      `scene ${index + 1}: ${lines.length} line(s), ${audioSec.toFixed(2)}s voice, ` +
        `${placement.totalSec.toFixed(2)}s speech, ${durationSec}s scene`,
    );

    cursor += durationSec;
    frameCursor += uiSceneFrames(finalScene, SCENE_FPS);
  }

  const voiced: UiEpisode = { ...episode, scenes, speech: speeches };

  await writeFile(path.join(outDir, 'episode.json'), `${JSON.stringify(voiced, null, 2)}\n`, 'utf8');
  await writeFile(
    path.join(outDir, 'manifest.json'),
    `${JSON.stringify(
      {
        input: path.relative(cwd, inputPath),
        provider,
        alignment: provider === 'google' ? 'estimated' : 'exact',
        fps: SCENE_FPS,
        totalSec: Number(cursor.toFixed(2)),
        scenes: voices,
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
