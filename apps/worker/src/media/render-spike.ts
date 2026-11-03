import { execFile } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { renderDraft, runFfmpeg } from './ffmpeg.js';
import { buildKaraokeAss, type WordTiming } from './karaoke.js';

const execFileAsync = promisify(execFile);

const workDir = process.env['RENDER_SPIKE_DIR'] ?? 'C:/Temp/opencode/render-spike';
const ffmpegBin = process.env['FFMPEG_BIN'] ?? 'ffmpeg';
const ffprobeBin = process.env['FFPROBE_BIN'] ?? 'ffprobe';

const text = 'Привет, это караоке для вертикального видео';
const words: WordTiming[] = text.split(' ').map((word, index) => ({
  text: word,
  startSec: index * 0.45,
  endSec: (index + 1) * 0.45,
}));
const durationSec = words.length * 0.45;

async function generateInputs(): Promise<void> {
  await runFfmpeg(
    [
      '-hide_banner',
      '-y',
      '-f',
      'lavfi',
      '-i',
      `testsrc2=size=1280x720:rate=30:duration=${durationSec + 2}`,
      '-pix_fmt',
      'yuv420p',
      'clip.mp4',
    ],
    { ffmpegBin, workDir },
  );

  await runFfmpeg(
    [
      '-hide_banner',
      '-y',
      '-f',
      'lavfi',
      '-i',
      `sine=frequency=440:duration=${durationSec}`,
      '-ar',
      '48000',
      'tone.mp3',
    ],
    { ffmpegBin, workDir },
  );
}

async function main(): Promise<void> {
  await mkdir(workDir, { recursive: true });

  console.log(`workDir: ${workDir}`);
  console.log(`duration: ${durationSec}s, words: ${words.length}`);

  await generateInputs();
  await writeFile(path.join(workDir, 'subtitles.ass'), buildKaraokeAss(words), 'utf8');

  const output = await renderDraft(
    {
      clipPath: 'clip.mp4',
      audioPath: 'tone.mp3',
      outputName: 'draft.mp4',
      workDir,
    },
    { ffmpegBin },
  );

  const { stdout } = await execFileAsync(ffprobeBin, [
    '-v',
    'error',
    '-show_entries',
    'format=duration,size:stream=codec_type,codec_name,width,height,r_frame_rate,sample_rate,channels',
    '-of',
    'json',
    output,
  ]);

  console.log(stdout);
}

await main();
