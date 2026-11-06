import { spawn } from 'node:child_process';
import { z } from 'zod';

export interface MediaProbe {
  durationSec: number;
  audioDurationSec: number;
  videoDurationSec: number;
  /** Audio packet timestamp gaps longer than 50 ms. */
  audioGaps: number[];
}

export interface FfprobeOptions {
  ffprobeBin?: string;
  timeoutMs?: number;
  workDir?: string;
}

const probeJsonSchema = z.object({
  format: z.object({ duration: z.string() }),
  streams: z.array(
    z.object({
      codec_type: z.string(),
      duration: z.string().optional(),
    }),
  ),
});

function toPositiveNumber(value: string, label: string): number {
  const number = Number(value);

  if (!Number.isFinite(number) || number < 0) {
    throw new Error(`ffprobe returned an invalid ${label}: ${value}`);
  }

  return number;
}

export function parseFfprobeJson(raw: string): {
  durationSec: number;
  audioDurationSec: number;
  videoDurationSec: number;
} {
  const parsed = probeJsonSchema.parse(JSON.parse(raw));
  const durationSec = toPositiveNumber(parsed.format.duration, 'duration');
  const audio = parsed.streams.find((stream) => stream.codec_type === 'audio');
  const video = parsed.streams.find((stream) => stream.codec_type === 'video');

  return {
    durationSec,
    audioDurationSec: audio?.duration
      ? toPositiveNumber(audio.duration, 'audio duration')
      : durationSec,
    videoDurationSec: video?.duration
      ? toPositiveNumber(video.duration, 'video duration')
      : durationSec,
  };
}

/** CSV rows: `pts_time,duration_time`; a jump over 50 ms is a real audio gap. */
export function parseAudioPacketGaps(csv: string): number[] {
  const points = csv
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => Number(line.split(',')[0]))
    .filter((value) => Number.isFinite(value))
    .sort((left, right) => left - right);
  const gaps: number[] = [];

  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];

    if (previous === undefined || current === undefined) {
      continue;
    }

    const gap = current - previous;

    if (gap > 0.05) {
      gaps.push(Math.round(gap * 1000) / 1000);
    }
  }

  return gaps;
}

/** Runs ffprobe with an argument array: no shell, no interpolation. */
export function runFfprobe(
  args: readonly string[],
  options: FfprobeOptions = {},
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(options.ffprobeBin ?? 'ffprobe', [...args], {
      cwd: options.workDir,
      shell: false,
      windowsHide: true,
    });

    let stdout = '';
    let stderr = '';
    const timeout = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error('ffprobe timed out'));
    }, options.timeoutMs ?? 30_000);

    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      stdout += chunk;
    });

    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk: string) => {
      stderr = `${stderr}${chunk}`.slice(-10_000);
    });

    child.on('error', (error) => {
      clearTimeout(timeout);
      reject(new Error(`Failed to start ffprobe: ${error.message}`));
    });

    child.on('close', (code) => {
      clearTimeout(timeout);

      if (code === 0) {
        resolve(stdout);
      } else {
        reject(new Error(`ffprobe exited with code ${code}: ${stderr}`));
      }
    });
  });
}

export async function probeMedia(
  filePath: string,
  options: FfprobeOptions = {},
): Promise<MediaProbe> {
  const json = await runFfprobe(
    [
      '-v',
      'error',
      '-show_entries',
      'format=duration',
      '-show_entries',
      'stream=codec_type,duration',
      '-of',
      'json',
      filePath,
    ],
    options,
  );
  const durations = parseFfprobeJson(json);
  const packets = await runFfprobe(
    [
      '-v',
      'error',
      '-select_streams',
      'a',
      '-show_entries',
      'packet=pts_time,duration_time',
      '-of',
      'csv=p=0',
      filePath,
    ],
    options,
  );

  return {
    ...durations,
    audioGaps: parseAudioPacketGaps(packets),
  };
}
