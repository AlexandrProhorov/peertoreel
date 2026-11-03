import { execFile } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { config as loadEnv } from 'dotenv';
import { renderDraft, runFfmpeg } from '../media/ffmpeg.js';
import { buildKaraokeAss } from '../media/karaoke.js';
import { synthesizeWithTimestamps } from './elevenlabs.js';
import { deriveWordTimings } from './word-timings.js';

const execFileAsync = promisify(execFile);

loadEnv({ path: '../../.env', quiet: true });

const workDir = process.env['RENDER_SPIKE_DIR'] ?? 'C:/Temp/opencode/tts-spike';
const ffmpegBin = process.env['FFMPEG_BIN'] ?? 'ffmpeg';
const ffprobeBin = process.env['FFPROBE_BIN'] ?? 'ffprobe';

const apiKey = process.env['ELEVENLABS_API_KEY'];
const voiceId = process.env['ELEVENLABS_VOICE_ID'];
const modelId = process.env['ELEVENLABS_MODEL_ID'] ?? 'eleven_multilingual_v2';

const text =
  'Почему небо синее? Молекулы воздуха рассеивают короткие волны сильнее, чем длинные.';

function requireEnv(): { apiKey: string; voiceId: string } {
  if (!apiKey || !voiceId) {
    throw new Error('ELEVENLABS_API_KEY и ELEVENLABS_VOICE_ID должны быть в .env');
  }

  // The dashboard shows both a key ID and the secret. Only "sk_..." is usable,
  // and the API answers a confusing 400 if the ID is sent instead.
  if (!apiKey.startsWith('sk_')) {
    throw new Error(
      'ELEVENLABS_API_KEY выглядит как API key ID. Нужен секрет, начинающийся с sk_ (dashboard → API keys → создать/rotare и скопировать значение).',
    );
  }

  return { apiKey, voiceId };
}

async function main(): Promise<void> {
  const credentials = requireEnv();

  await mkdir(workDir, { recursive: true });
  console.log(`workDir: ${workDir}`);
  console.log(`model: ${modelId}, text chars: ${text.length}`);

  const startedAt = Date.now();
  const { audio, alignment } = await synthesizeWithTimestamps({
    text,
    modelId,
    ...credentials,
  });
  console.log(`tts: ${audio.length} bytes in ${Date.now() - startedAt} ms`);

  const words = deriveWordTimings(alignment);
  const lastWordEnd = words.at(-1)?.endSec ?? 0;
  console.log(`words: ${words.length}, last word ends at ${lastWordEnd.toFixed(2)}s`);
  console.log(
    `first words: ${words
      .slice(0, 5)
      .map((word) => `${word.text}[${word.startSec.toFixed(2)}–${word.endSec.toFixed(2)}]`)
      .join(' ')}`,
  );

  await writeFile(path.join(workDir, 'voiceover.mp3'), audio);
  await writeFile(
    path.join(workDir, 'word_timings.json'),
    JSON.stringify(words, null, 2),
    'utf8',
  );
  await writeFile(
    path.join(workDir, 'subtitles.ass'),
    buildKaraokeAss(words),
    'utf8',
  );

  await runFfmpeg(
    [
      '-hide_banner',
      '-y',
      '-f',
      'lavfi',
      '-i',
      `testsrc2=size=1280x720:rate=30:duration=${(lastWordEnd + 1).toFixed(2)}`,
      '-pix_fmt',
      'yuv420p',
      'clip.mp4',
    ],
    { ffmpegBin, workDir },
  );

  const output = await renderDraft(
    {
      clipPath: 'clip.mp4',
      audioPath: 'voiceover.mp3',
      outputName: 'draft.mp4',
      workDir,
    },
    { ffmpegBin },
  );

  const { stdout } = await execFileAsync(ffprobeBin, [
    '-v',
    'error',
    '-show_entries',
    'format=duration,size:stream=codec_type,codec_name,width,height,r_frame_rate',
    '-of',
    'json',
    output,
  ]);

  console.log(stdout);
}

try {
  await main();
} catch (error: unknown) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
