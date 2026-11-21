import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

/**
 * Mux step: the silent Remotion film plus the per-scene voice, the subtitles
 * burned in. Audio and subtitles are an FFmpeg concern (root AGENTS §4), so they
 * are assembled here, not inside the renderer.
 *
 *   ui:mux --video out/film/render/episode.mp4 --voice out/film/voice --out out/film/final.mp4
 */

function optionValue(name: string): string | undefined {
  const inline = process.argv.find((argument) => argument.startsWith(`${name}=`));

  if (inline !== undefined) {
    return inline.slice(name.length + 1);
  }

  const index = process.argv.indexOf(name);

  return index < 0 ? undefined : process.argv[index + 1];
}

interface VoiceManifest {
  readonly totalSec: number;
  readonly subtitles: string;
  readonly scenes: ReadonlyArray<{ readonly index: number; readonly file: string; readonly startSec: number }>;
}

function run(command: string, args: readonly string[], cwd: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, [...args], { cwd, stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';

    child.stderr.on('data', (chunk: Buffer) => {
      stderr = `${stderr}${chunk.toString()}`.slice(-4000);
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

async function main(): Promise<void> {
  const cwd = process.cwd();
  const video = optionValue('--video');
  const voiceDir = optionValue('--voice');
  const out = optionValue('--out');

  if (video === undefined || voiceDir === undefined || out === undefined) {
    throw new Error('--video <film.mp4> --voice <dir> --out <final.mp4> are required');
  }

  const voicePath = path.resolve(cwd, voiceDir);
  const manifest: VoiceManifest = JSON.parse(
    await readFile(path.join(voicePath, 'manifest.json'), 'utf8'),
  );
  const videoPath = path.resolve(cwd, video);
  const outPath = path.resolve(cwd, out);
  const ffmpeg = process.env['FFMPEG_BIN'] ?? 'ffmpeg';

  const args: string[] = ['-y', '-i', videoPath];

  for (const scene of manifest.scenes) {
    args.push('-i', path.join(voicePath, scene.file));
  }

  /* Each scene's voice starts at its own offset; the mix keeps full volume. */
  const delays = manifest.scenes.map((scene, index) => {
    const ms = Math.round(scene.startSec * 1000);

    return `[${index + 1}:a]adelay=${ms}|${ms}[a${index + 1}]`;
  });
  const inputs = manifest.scenes.map((_, index) => `[a${index + 1}]`).join('');
  const mix = `${inputs}amix=inputs=${manifest.scenes.length}:duration=longest:normalize=0[aout]`;

  args.push(
    '-filter_complex',
    [...delays, mix].join(';'),
    '-map',
    '0:v',
    '-map',
    '[aout]',
    /* Subtitle path stays relative: FFmpeg on Windows chokes on `C\:` in filter
       arguments, and the process runs inside the voice directory. MarginV keeps
       the line above the platform's bottom bar, not under it. */
    '-vf',
    `subtitles=${manifest.subtitles}:force_style='Alignment=2,MarginV=55,Fontsize=14,Outline=2,Shadow=0,BorderStyle=1'`,
    '-c:v',
    'libx264',
    '-crf',
    '20',
    '-pix_fmt',
    'yuv420p',
    '-c:a',
    'aac',
    '-b:a',
    '192k',
    '-shortest',
    outPath,
  );

  await run(ffmpeg, args, voicePath);
  console.log(`mux: ${outPath} (${manifest.totalSec}s, ${manifest.scenes.length} voice scene(s))`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
