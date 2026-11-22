import type { DerivedWord } from '@peertoreel/contracts';
import { interpolate } from 'remotion';

/** Same rounding as `apps/worker` synthetic timings: stable in JSON output. */
function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

export interface WordScheduleOptions {
  readonly durationSec: number;
  readonly wordsPerSec: number;
  readonly startSec?: number;
}

/**
 * Deterministic fallback for the type-on reveal. Production reads real
 * `word_timings` from TTS; this exists so the pilot can be rendered without an
 * audio track and still prove word-level control of the frame.
 */
export function scheduleWords(
  text: string,
  options: WordScheduleOptions,
): DerivedWord[] {
  const tokens = text.trim().split(/\s+/).filter(Boolean);
  const step = 1 / Math.max(0.5, options.wordsPerSec);
  const start = options.startSec ?? 0;
  const lastStart = Math.max(start, options.durationSec - 0.12);

  return tokens.map((token, index) => {
    const begin = Math.min(start + index * step, lastStart);

    return {
      text: token,
      startSec: round3(begin),
      endSec: round3(Math.min(begin + step * 0.8, options.durationSec)),
    };
  });
}

export function toFrame(sec: number, fps: number): number {
  return Math.round(sec * fps);
}

/** 0 → 1 over `durationFrames` starting at `startFrame`, clamped on both sides. */
export function reveal(
  frame: number,
  startFrame: number,
  durationFrames = 3,
): number {
  return interpolate(
    frame,
    [startFrame, startFrame + durationFrames],
    [0, 1],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  );
}
