import { execFile } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import {
  scriptPlannedDurationSec,
  scriptSchema,
  scriptSpeechText,
} from '@peertoreel/contracts';
import { config as loadEnv } from 'dotenv';
import { generateJson } from '../llm/deepseek.js';
import { renderDraft, runFfmpeg } from '../media/ffmpeg.js';
import { buildKaraokeAss } from '../media/karaoke.js';
import { synthesizeWithTimestamps } from '../tts/elevenlabs.js';
import { deriveWordTimings } from '../tts/word-timings.js';
import { scriptSystemPrompt, scriptUserPrompt } from './prompt.js';

const execFileAsync = promisify(execFile);

loadEnv({ path: '../../.env', quiet: true });

const workDir = process.env['SCRIPT_SPIKE_DIR'] ?? 'C:/Temp/opencode/script-spike';
const ffmpegBin = process.env['FFMPEG_BIN'] ?? 'ffmpeg';
const ffprobeBin = process.env['FFPROBE_BIN'] ?? 'ffprobe';

const topic = process.argv[2] ?? 'Почему небо синее';

function requireEnv(): {
  deepseekKey: string;
  elevenKey: string;
  voiceId: string;
} {
  const deepseekKey = process.env['DEEPSEEK_API_KEY'];
  const elevenKey = process.env['ELEVENLABS_API_KEY'];
  const voiceId = process.env['ELEVENLABS_VOICE_ID'];

  if (!deepseekKey || !elevenKey || !voiceId) {
    throw new Error('Нужны DEEPSEEK_API_KEY, ELEVENLABS_API_KEY, ELEVENLABS_VOICE_ID в .env');
  }

  return { deepseekKey, elevenKey, voiceId };
}

async function main(): Promise<void> {
  const env = requireEnv();
  await mkdir(workDir, { recursive: true });

  console.log(`topic: ${topic}`);
  console.log(`workDir: ${workDir}`);

  // 1. Script
  const startedAt = Date.now();
  const { data: script, usage, attempts } = await generateJson(scriptSchema, {
    apiKey: env.deepseekKey,
    baseUrl: process.env['LLM_BASE_URL'] ?? 'https://api.deepseek.com',
    model: process.env['LLM_MODEL'] ?? 'deepseek-flash',
    system: scriptSystemPrompt(),
    user: scriptUserPrompt(topic),
    maxTokens: 2000,
  });

  await writeFile(path.join(workDir, 'script.json'), JSON.stringify(script, null, 2), 'utf8');

  const speech = scriptSpeechText(script);
  console.log(
    `script: ${script.beats.length} beats, planned ${scriptPlannedDurationSec(script)}s, ` +
      `${speech.length} chars, attempts ${attempts}, tokens ${usage.promptTokens}/${usage.completionTokens}, ` +
      `${Date.now() - startedAt} ms`,
  );
  console.log(`title: ${script.title}`);
  console.log(`hook: ${script.hook}`);

  // 2. Voiceover with word timings
  const ttsStartedAt = Date.now();
  const { audio, alignment } = await synthesizeWithTimestamps({
    text: speech,
    apiKey: env.elevenKey,
    voiceId: env.voiceId,
    modelId: process.env['ELEVENLABS_MODEL_ID'] ?? 'eleven_multilingual_v2',
  });
  const words = deriveWordTimings(alignment);
  const lastWordEnd = words.at(-1)?.endSec ?? 0;

  await writeFile(path.join(workDir, 'voiceover.mp3'), audio);
  await writeFile(
    path.join(workDir, 'word_timings.json'),
    JSON.stringify(words, null, 2),
    'utf8',
  );
  await writeFile(path.join(workDir, 'subtitles.ass'), buildKaraokeAss(words), 'utf8');

  console.log(
    `tts: ${audio.length} bytes in ${Date.now() - ttsStartedAt} ms, ${words.length} words, ` +
      `speech ends at ${lastWordEnd.toFixed(2)}s`,
  );

  // 3. Background clip (synthetic until the visuals stage exists)
  await runFfmpeg(
    [
      '-hide_banner',
      '-y',
      '-f',
      'lavfi',
      '-i',
      `testsrc2=size=1080x1920:rate=30:duration=${(lastWordEnd + 1).toFixed(2)}`,
      '-pix_fmt',
      'yuv420p',
      'clip.mp4',
    ],
    { ffmpegBin, workDir },
  );

  // 4. Render
  const renderStartedAt = Date.now();
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

  console.log(`render: ${Date.now() - renderStartedAt} ms`);
  console.log(stdout);
}

try {
  await main();
} catch (error: unknown) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
