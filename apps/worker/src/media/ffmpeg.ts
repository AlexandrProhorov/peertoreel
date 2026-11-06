import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import {
  buildLoudnormFilter,
  parseLoudnormJson,
  type LoudnormMeasurement,
} from './loudnorm.js';

export interface RenderInput {
  clipPath: string;
  audioPath: string;
  outputName: string;
  /** Working directory: the ASS file is referenced by name, not by path. */
  workDir: string;
  assName?: string;
}

export interface RenderOptions {
  ffmpegBin?: string;
  timeoutMs?: number;
}

export const RENDER_TARGET = {
  width: 1080,
  height: 1920,
  fps: 30,
  loudnessI: -14,
  loudnessTp: -1.5,
  loudnessLra: 11,
} as const;

export function buildRenderArgs(
  input: RenderInput,
  measured?: LoudnormMeasurement,
): string[] {
  const ass = input.assName ?? 'subtitles.ass';
  const { width, height, fps, loudnessI, loudnessTp, loudnessLra } = RENDER_TARGET;
  const loudnorm = measured
    ? buildLoudnormFilter(
        { I: loudnessI, TP: loudnessTp, LRA: loudnessLra },
        measured,
      )
    : `loudnorm=I=${loudnessI}:TP=${loudnessTp}:LRA=${loudnessLra}`;

  return [
    '-hide_banner',
    '-y',
    '-i',
    input.clipPath,
    '-i',
    input.audioPath,
    '-filter_complex',
    `[0:v]scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},setsar=1,fps=${fps},ass=${ass}[v];[1:a]${loudnorm}[a]`,
    '-map',
    '[v]',
    '-map',
    '[a]',
    '-c:v',
    'libx264',
    '-preset',
    'medium',
    '-crf',
    '21',
    '-pix_fmt',
    'yuv420p',
    '-c:a',
    'aac',
    '-b:a',
    '128k',
    '-ar',
    '48000',
    '-movflags',
    '+faststart',
    '-shortest',
    input.outputName,
  ];
}

export class FfmpegError extends Error {
  constructor(
    message: string,
    readonly exitCode: number | null,
    readonly stderr: string,
  ) {
    super(message);
    this.name = 'FfmpegError';
  }
}

/** Runs FFmpeg with an argument array: no shell, no string interpolation. */
export function runFfmpeg(
  args: readonly string[],
  options: RenderOptions & { workDir: string },
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(options.ffmpegBin ?? 'ffmpeg', [...args], {
      cwd: options.workDir,
      shell: false,
      windowsHide: true,
    });

    let stderr = '';
    const timeout = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new FfmpegError('FFmpeg timed out', null, stderr));
    }, options.timeoutMs ?? 5 * 60 * 1000);

    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk: string) => {
      stderr = `${stderr}${chunk}`.slice(-20000);
    });

    child.on('error', (error) => {
      clearTimeout(timeout);
      reject(new FfmpegError(`Failed to start FFmpeg: ${error.message}`, null, stderr));
    });

    child.on('close', (code) => {
      clearTimeout(timeout);

      if (code === 0) {
        resolve(stderr);
      } else {
        reject(new FfmpegError(`FFmpeg exited with code ${code}`, code, stderr));
      }
    });
  });
}

/** Pass 1 of loudnorm: measure the voiceover before touching the video. */
export async function measureLoudness(
  audioPath: string,
  options: RenderOptions & { workDir: string },
): Promise<LoudnormMeasurement> {
  const { loudnessI, loudnessTp, loudnessLra } = RENDER_TARGET;
  const stderr = await runFfmpeg(
    [
      '-hide_banner',
      '-nostats',
      '-i',
      audioPath,
      '-map',
      '0:a',
      '-af',
      `loudnorm=I=${loudnessI}:TP=${loudnessTp}:LRA=${loudnessLra}:print_format=json`,
      '-f',
      'null',
      '-',
    ],
    options,
  );

  return parseLoudnormJson(stderr);
}

export async function renderDraft(
  input: RenderInput,
  options: RenderOptions = {},
): Promise<string> {
  await mkdir(input.workDir, { recursive: true });

  const measured = await measureLoudness(input.audioPath, {
    ...options,
    workDir: input.workDir,
  });

  await runFfmpeg(buildRenderArgs(input, measured), {
    ...options,
    workDir: input.workDir,
  });

  return path.join(input.workDir, input.outputName);
}
