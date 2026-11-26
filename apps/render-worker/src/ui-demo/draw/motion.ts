import type { DrawTransition } from './schema.js';

/**
 * Node motion.
 *
 * Time lives on the node: `at` says when it starts, `transition` says how it
 * arrives. The scene keeps a short assembly window — the first 45 % of its
 * length — and the rest is the finished picture. That is a property of the
 * device, not of the model: a plan that says "5 s" always holds the frame.
 *
 * Everything here is pure: same frame, same numbers. DrawScene only reads it.
 */

/** Share of the scene used to assemble the picture. */
export const MOTION_SHARE = 0.45;

const APPEAR_SEC = 0.25;
const SLIDE_SEC = 0.35;
const SLIDE_OFFSET = 72;
const DRAW_SEC = 0.55;
const TYPE_CHARS_PER_SEC = 45;
const PRINT_STEP_SEC = 0.3;

export interface MotionState {
  readonly opacity: number;
  readonly offsetY: number;
  /** Text after `type`/`tick`; unchanged for other nodes. */
  readonly text: string;
  /** Share of a line already drawn, 0..1. */
  readonly drawn: number;
  /** How many children of a `print` container are already on screen. */
  readonly childCount: number;
}

export interface MotionInput {
  readonly transition: DrawTransition;
  readonly at: number;
  readonly frame: number;
  readonly fps: number;
  readonly durationSec: number;
  readonly text?: string;
  readonly childCount?: number;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function easeOut(value: number): number {
  return 1 - (1 - value) ** 2;
}

/** The last second a node may start at while the frame still holds. */
export function motionWindow(durationSec: number): number {
  return Math.max(0.4, durationSec * MOTION_SHARE);
}

/**
 * Steps of a counter: the value climbs in three moves and lands on the number
 * the model wrote. Smooth interpolation would read as a video scrub, not a
 * counter.
 */
export function tickText(text: string, progress: number): string {
  const match = /-?\d[\d.,]*(?:[\s\u00a0]\d{3}(?!\d))*/u.exec(text);

  if (match === null) {
    return text;
  }

  const raw = match[0];
  const final = Number(raw.replace(/[\s,]/g, ''));

  if (!Number.isFinite(final)) {
    return text;
  }

  const share = progress < 1 / 3 ? 0.25 : progress < 2 / 3 ? 0.6 : 1;
  const value = Math.round(final * share);

  return text.slice(0, match.index) + String(value) + text.slice(match.index + raw.length);
}

export function nodeMotion(input: MotionInput): MotionState {
  const { transition, at, frame, fps, durationSec, text, childCount = 0 } = input;
  const windowSec = motionWindow(durationSec);
  /* Authored beats assemble in the first 45 %; a text that backs a spoken line
     may start later, so its clamp is the scene tail, not the window. */
  const start = Math.min(Math.max(at, 0), Math.max(0.4, durationSec - 0.3));
  const local = frame / fps - start;
  const full: MotionState = { opacity: 1, offsetY: 0, text: text ?? '', drawn: 1, childCount };

  if (local <= 0) {
    const hidden = text ?? '';

    return {
      ...full,
      /* A counter is on screen from the start: it shows its first step. */
      opacity: transition === 'tick' ? 1 : 0,
      offsetY: transition === 'slide' ? SLIDE_OFFSET : 0,
      text: transition === 'type' ? '' : transition === 'tick' ? tickText(hidden, 0) : hidden,
      drawn: transition === 'draw' ? 0 : 1,
      childCount: transition === 'print' ? 0 : childCount,
    };
  }

  switch (transition) {
    case 'appear':
      return { ...full, opacity: clamp01(local / APPEAR_SEC) };

    case 'slide': {
      const progress = easeOut(clamp01(local / SLIDE_SEC));

      /* A sliding object does not fade: it is already there, it is only moving.
         Fading it on top of the move is what made the board look muddy. */
      return {
        ...full,
        opacity: 1,
        offsetY: Math.round((1 - progress) * SLIDE_OFFSET),
      };
    }

    case 'type': {
      const source = text ?? '';
      /* A narration line types over the remaining tail, not over the assembly
         window: a line that starts at 4 s still types instead of snapping. */
      const room = Math.max(0.15, durationSec - 0.25 - start);
      const duration = Math.min(room, Math.max(0.15, source.length / TYPE_CHARS_PER_SEC));
      const chars = Math.round(source.length * clamp01(local / duration));

      return { ...full, text: source.slice(0, chars) };
    }

    case 'tick': {
      const room = Math.max(0.2, windowSec - start);

      return { ...full, text: tickText(text ?? '', clamp01(local / room)) };
    }

    case 'print': {
      const step = Math.min(PRINT_STEP_SEC, Math.max(0.08, (windowSec - start) / Math.max(1, childCount - 1)));
      let shown = 0;

      while (shown < childCount && local >= shown * step) {
        shown += 1;
      }

      return { ...full, childCount: shown };
    }

    case 'draw':
      return { ...full, drawn: clamp01(local / DRAW_SEC) };

    default:
      return full;
  }
}

/** Frame at which every node of the scene has finished arriving. */
export function motionEndFrame(
  nodes: readonly { at?: number; transition?: DrawTransition; children?: readonly unknown[] }[],
  durationSec: number,
  fps: number,
): number {
  const windowSec = motionWindow(durationSec);
  let end = 0;

  for (const node of nodes) {
    end = Math.max(end, Math.min(node.at ?? 0, windowSec));
  }

  return Math.round((end + APPEAR_SEC) * fps);
}

/** Every authored step of the scene, in seconds and inside the motion window. */
export function nodeStarts(
  nodes: readonly { at?: number; children?: readonly unknown[] }[],
  durationSec: number,
): number[] {
  const windowSec = motionWindow(durationSec);
  const starts: number[] = [];

  const walk = (list: readonly { at?: number; children?: readonly unknown[] }[]): void => {
    for (const node of list) {
      if (node.at !== undefined) {
        starts.push(Math.min(node.at, windowSec));
      }

      if (Array.isArray(node.children)) {
        walk(node.children as { at?: number; children?: readonly unknown[] }[]);
      }
    }
  };

  walk(nodes);

  return [...new Set(starts)].sort((left, right) => left - right);
}
