import type { DerivedWord } from '@peertoreel/contracts';
import type { SpeechTrack, UiScene } from './spec.js';

/**
 * Two independent time streams.
 *
 * `visualTimeline` owns when the device appears and reveals its content. It is
 * derived from the scene's own `durationSec`/`revealSec` and authored offsets.
 *
 * `speechTimeline` owns captions and spoken-word highlight. It comes from TTS
 * (`word_timings`) and never decides when interface content appears: a card can
 * be fully typed while the narration still reads its first line.
 */
export interface VisualTimeline {
  readonly durationInFrames: number;
  readonly titleFrame: number;
  readonly revealFrame: number;
  readonly revealWindowFrames: number;
  /** Per-message (chat) or per-line (selection) reveal frames. */
  readonly stepFrames: readonly number[];
}

const TITLE_FRAME = 2;

function toFrame(sec: number, fps: number): number {
  return Math.round(sec * fps);
}

/** Even distribution of `count` steps across the reveal window. */
function spread(
  count: number,
  revealFrame: number,
  windowFrames: number,
): number[] {
  if (count <= 1) {
    return [revealFrame];
  }

  const step = windowFrames / (count - 1);

  return Array.from({ length: count }, (_, index) =>
    Math.round(revealFrame + index * step),
  );
}

export function visualTimeline(scene: UiScene, fps: number): VisualTimeline {
  const durationInFrames = Math.max(1, Math.round(scene.durationSec * fps));
  const revealFrame = toFrame(0.2, fps);
  const revealWindowFrames = Math.max(
    1,
    Math.round(scene.revealSec * fps),
  );

  switch (scene.device) {
    case 'prompt-card': {
      const tokens = scene.cardText.trim().split(/\s+/).filter(Boolean).length;

      return {
        durationInFrames,
        titleFrame: TITLE_FRAME,
        revealFrame,
        revealWindowFrames,
        stepFrames: spread(tokens, revealFrame, revealWindowFrames),
      };
    }
    case 'text-selection':
      return {
        durationInFrames,
        titleFrame: TITLE_FRAME,
        revealFrame,
        revealWindowFrames,
        stepFrames: spread(
          scene.lines.length,
          revealFrame,
          revealWindowFrames,
        ),
      };
    case 'chat-reconstruction':
      return {
        durationInFrames,
        titleFrame: TITLE_FRAME,
        revealFrame,
        revealWindowFrames,
        stepFrames: scene.messages.map((message) =>
          Math.min(durationInFrames, toFrame(message.appearAtSec, fps)),
        ),
      };
    case 'title-stack':
      return {
        durationInFrames,
        titleFrame: TITLE_FRAME,
        revealFrame,
        revealWindowFrames,
        stepFrames: spread(
          scene.title.trim().split(/\s+/).filter(Boolean).length,
          revealFrame,
          revealWindowFrames,
        ),
      };
    case 'social-proof':
      return {
        durationInFrames,
        titleFrame: TITLE_FRAME,
        revealFrame,
        revealWindowFrames,
        stepFrames: spread(scene.cards.length, revealFrame, revealWindowFrames),
      };
    case 'prediction-input':
      return {
        durationInFrames,
        titleFrame: TITLE_FRAME,
        revealFrame,
        revealWindowFrames,
        /** [prompt in, answer in] — the answer is a separate visual beat. */
        stepFrames: [revealFrame, Math.round(durationInFrames * 0.62)],
      };
    case 'object-reveal':
      return {
        durationInFrames,
        titleFrame: TITLE_FRAME,
        revealFrame,
        revealWindowFrames,
        stepFrames: spread(
          scene.caption.trim().split(/\s+/).filter(Boolean).length,
          revealFrame,
          revealWindowFrames,
        ),
      };
    case 'input-transform':
      return {
        durationInFrames,
        titleFrame: TITLE_FRAME,
        revealFrame,
        revealWindowFrames,
        /** [typing starts, submit, waiting] — one mechanism, three phases. */
        stepFrames: [
          revealFrame,
          Math.round(durationInFrames * 0.45),
          Math.round(durationInFrames * 0.7),
        ],
      };
    case 'impact-arrival':
      return {
        durationInFrames,
        titleFrame: TITLE_FRAME,
        revealFrame,
        revealWindowFrames,
        /** [drop starts, impact, index lights up]. */
        stepFrames: [
          revealFrame,
          Math.round(durationInFrames * 0.34),
          Math.round(durationInFrames * 0.42),
        ],
      };
    case 'scale-break':
      return {
        durationInFrames,
        titleFrame: TITLE_FRAME,
        revealFrame,
        revealWindowFrames,
        /** [scale starts, the line breaks]. */
        stepFrames: [revealFrame, Math.round(durationInFrames * 0.62)],
      };
    case 'spec':
      return {
        durationInFrames,
        titleFrame: TITLE_FRAME,
        revealFrame,
        revealWindowFrames,
        stepFrames: scene.spec.sequence.map((step) => Math.round(step.at * fps)),
      };
  }
}

export interface SpeechTimeline {
  readonly track: SpeechTrack;
}

export function speechTimeline(track: SpeechTrack): SpeechTimeline {
  return { track };
}

/** Index of the word being spoken at `frame`, or -1 before the first word. */
export function spokenWordIndex(
  timeline: SpeechTimeline,
  frame: number,
  fps: number,
): number {
  const words = timeline.track.words;
  let index = -1;

  for (const [position, word] of words.entries()) {
    if (frame >= Math.round(word.startSec * fps)) {
      index = position;
    } else {
      break;
    }
  }

  return index;
}

export function spokenWord(
  timeline: SpeechTimeline,
  frame: number,
  fps: number,
): DerivedWord | null {
  const index = spokenWordIndex(timeline, frame, fps);

  return index < 0 ? null : (timeline.track.words[index] ?? null);
}

/** Caption window: the words spoken around `frame`, capped for readability. */
export function captionWords(
  timeline: SpeechTimeline,
  frame: number,
  fps: number,
  maxWords = 4,
): DerivedWord[] {
  const index = spokenWordIndex(timeline, frame, fps);

  if (index < 0) {
    return [];
  }

  return timeline.track.words.slice(index, index + maxWords);
}
