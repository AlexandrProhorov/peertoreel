import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { RENDER_TARGET, runFfmpeg, type RenderOptions } from './ffmpeg.js';

export type VisualTrackKind = 'video' | 'image' | 'fallback';

export interface VisualTrackScene {
  idx: number;
  kind: VisualTrackKind;
  /** File name relative to the render work directory; null for a fallback. */
  fileName: string | null;
  durationSec: number;
}

export interface VisualTrackSegment {
  idx: number;
  kind: VisualTrackKind;
  fileName: string | null;
  durationSec: number;
}

export interface VisualTrackPlan {
  segments: VisualTrackSegment[];
  totalDurationSec: number;
}

export interface VisualTrackInput {
  scenes: readonly VisualTrackScene[];
  targetDurationSec: number;
  workDir: string;
  outputName?: string;
}

const MIN_SEGMENT_SEC = 0.05;

function formatDuration(seconds: number): string {
  return seconds.toFixed(3);
}

function fallbackSegment(idx: number, durationSec: number): VisualTrackSegment {
  return { idx, kind: 'fallback', fileName: null, durationSec };
}

/**
 * Normalizes scene durations to the audio track: the last scene is extended if
 * the scenes are shorter, and the tail is trimmed if they are longer. All
 * segments stay positive so FFmpeg never receives a zero-length input.
 */
export function planVisualTrack(
  scenes: readonly VisualTrackScene[],
  targetDurationSec: number,
): VisualTrackPlan {
  const target = Math.max(MIN_SEGMENT_SEC, targetDurationSec);
  const segments: VisualTrackSegment[] = scenes.map((scene) => {
    const fileName = scene.kind === 'fallback' ? null : scene.fileName;

    return {
      idx: scene.idx,
      kind: fileName === null ? 'fallback' : scene.kind,
      fileName,
      durationSec: Math.max(MIN_SEGMENT_SEC, scene.durationSec),
    };
  });

  if (segments.length === 0) {
    return {
      segments: [fallbackSegment(0, target)],
      totalDurationSec: target,
    };
  }

  const total = segments.reduce((sum, segment) => sum + segment.durationSec, 0);

  if (total < target) {
    const last = segments[segments.length - 1];

    if (last) {
      last.durationSec += target - total;
    }
  } else if (total > target) {
    let excess = total - target;

    for (let index = segments.length - 1; index >= 0 && excess > 0; index -= 1) {
      const segment = segments[index];

      if (!segment) {
        continue;
      }

      const trim = Math.min(segment.durationSec, excess);
      segment.durationSec -= trim;
      excess -= trim;

      if (segment.durationSec < MIN_SEGMENT_SEC) {
        segments.splice(index, 1);
      }
    }
  }

  if (segments.length === 0) {
    return {
      segments: [fallbackSegment(0, target)],
      totalDurationSec: target,
    };
  }

  const normalizedTotal = segments.reduce(
    (sum, segment) => sum + segment.durationSec,
    0,
  );

  if (normalizedTotal < target) {
    const last = segments[segments.length - 1];

    if (last) {
      last.durationSec += target - normalizedTotal;
    }
  }

  return {
    segments,
    totalDurationSec: segments.reduce(
      (sum, segment) => sum + segment.durationSec,
      0,
    ),
  };
}

const VIDEO_FILTER = [
  `scale=${RENDER_TARGET.width}:${RENDER_TARGET.height}:force_original_aspect_ratio=increase`,
  `crop=${RENDER_TARGET.width}:${RENDER_TARGET.height}`,
  'setsar=1',
  `fps=${RENDER_TARGET.fps}`,
].join(',');

function encodeArgs(outputName: string): string[] {
  return [
    '-an',
    '-c:v',
    'libx264',
    '-preset',
    'veryfast',
    '-crf',
    '20',
    '-pix_fmt',
    'yuv420p',
    '-r',
    String(RENDER_TARGET.fps),
    '-video_track_timescale',
    '90000',
    '-movflags',
    '+faststart',
    outputName,
  ];
}

/** FFmpeg arguments for one silent 1080×1920 segment. */
export function buildVisualSegmentArgs(
  segment: VisualTrackSegment,
  outputName: string,
): string[] {
  const duration = formatDuration(segment.durationSec);

  if (segment.kind === 'fallback' || segment.fileName === null) {
    return [
      '-hide_banner',
      '-y',
      '-f',
      'lavfi',
      '-i',
      `testsrc2=size=${RENDER_TARGET.width}x${RENDER_TARGET.height}:rate=${RENDER_TARGET.fps}:duration=${duration}`,
      '-t',
      duration,
      ...encodeArgs(outputName),
    ];
  }

  if (segment.kind === 'video') {
    return [
      '-hide_banner',
      '-y',
      '-stream_loop',
      '-1',
      '-i',
      segment.fileName,
      '-t',
      duration,
      '-vf',
      VIDEO_FILTER,
      ...encodeArgs(outputName),
    ];
  }

  return [
    '-hide_banner',
    '-y',
    '-loop',
    '1',
    '-i',
    segment.fileName,
    '-t',
    duration,
    '-vf',
    VIDEO_FILTER,
    ...encodeArgs(outputName),
  ];
}

/**
 * Concat demuxer with a CFR re-encode. `-c copy` preserves DTS gaps between
 * segments; the muxer then drops chunks of the voiceover at scene boundaries.
 * Re-encoding with `fps=30` produces a continuous video timeline, so the audio
 * track stays intact.
 */
export function buildVisualConcatArgs(
  listName: string,
  outputName: string,
): string[] {
  return [
    '-hide_banner',
    '-y',
    '-f',
    'concat',
    '-safe',
    '0',
    '-i',
    listName,
    '-vf',
    `fps=${RENDER_TARGET.fps},setsar=1`,
    '-c:v',
    'libx264',
    '-preset',
    'veryfast',
    '-crf',
    '20',
    '-pix_fmt',
    'yuv420p',
    '-r',
    String(RENDER_TARGET.fps),
    '-video_track_timescale',
    '90000',
    '-movflags',
    '+faststart',
    outputName,
  ];
}

export async function buildVisualTrack(
  input: VisualTrackInput,
  options: RenderOptions = {},
): Promise<string> {
  await mkdir(input.workDir, { recursive: true });

  const outputName = input.outputName ?? 'visuals.mp4';
  const plan = planVisualTrack(input.scenes, input.targetDurationSec);
  const listLines: string[] = [];

  for (const segment of plan.segments) {
    const segmentName = `visual-segment-${segment.idx}.mp4`;

    await runFfmpeg(buildVisualSegmentArgs(segment, segmentName), {
      ...options,
      workDir: input.workDir,
    });
    listLines.push(`file '${segmentName}'`);
  }

  const listName = 'visual-segments.txt';
  await writeFile(
    path.join(input.workDir, listName),
    `${listLines.join('\n')}\n`,
    'utf8',
  );
  await runFfmpeg(buildVisualConcatArgs(listName, outputName), {
    ...options,
    workDir: input.workDir,
  });

  return path.join(input.workDir, outputName);
}
