import { TEXT_PRIMITIVES, type PrimitiveId } from '../catalog.js';
import { UI_THEMES, type UiThemeId } from '../themes.js';
import type { SpecScene } from '../spec.js';

/**
 * A scene is never dropped.
 *
 * The pipeline is a content factory: a film that is three seconds short is a
 * failure, while a weak scene that keeps its place on the timeline is a defect
 * we can see, mark and fix later. These helpers keep the place.
 *
 * A degraded scene keeps the seconds the arc planned for it, not the seconds
 * the surviving content happens to need: the timeline is shared with the
 * voiceover and the subtitles, and they are authored against the plan.
 */

/** Label copy is capped by the contract; an intent can be three times longer. */
const MAX_LABEL_CHARS = 80;

/** Primitives whose own copy makes a scene say something. */
const CONTENT_PRIMITIVES = new Set(['object', 'avatar']);

export interface PlannedScene {
  readonly id: string;
  readonly seconds: number;
  readonly theme: UiThemeId;
  readonly intent: string;
}

export interface FallbackOptions {
  /** The model's own words from a failed attempt, when one produced any. */
  readonly title?: string | null;
  readonly reasons?: readonly string[];
}

function clampSeconds(seconds: number): number {
  /* Same bounds as `sceneBaseShape.durationSec`, so a degraded scene stays a
     valid scene. */
  return Number(Math.min(20, Math.max(0.5, seconds)).toFixed(2));
}

function shortCopy(intent: string): string {
  const single = intent.replace(/\s+/g, ' ').trim();

  if (single.length <= MAX_LABEL_CHARS) {
    return single;
  }

  const cut = single.slice(0, MAX_LABEL_CHARS - 1);
  const lastSpace = cut.lastIndexOf(' ');

  return `${(lastSpace > 40 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

function reasonsOf(reasons: readonly string[]): { reasons: string[] } {
  return {
    reasons: reasons
      .filter((reason) => reason.trim() !== '')
      .slice(0, 8)
      .map((reason) => reason.slice(0, 200)),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Does the scene say anything at all?
 *
 * A composition that lost every text and every object — three empty circles, a
 * stage with a grid — passes geometry and fails meaning. It is replaced by the
 * fallback archetype instead of being shipped as a husk.
 */
export function hasContent(scene: SpecScene): boolean {
  return scene.spec.elements.some((element) => {
    const params = element.params as Readonly<Record<string, unknown>>;
    const primitive = element.primitive as PrimitiveId;

    if (TEXT_PRIMITIVES.has(primitive)) {
      const text = params['text'];

      return typeof text === 'string' && text.trim() !== '';
    }

    if (CONTENT_PRIMITIVES.has(primitive)) {
      const asset = params['asset'];

      return typeof asset === 'string' && asset.trim() !== '';
    }

    return false;
  });
}

function sceneBodies(document: unknown): readonly unknown[] | null {
  if (isRecord(document) && Array.isArray(document['scenes'])) {
    return document['scenes'];
  }

  if (isRecord(document) && typeof document['device'] === 'string') {
    return [document];
  }

  return null;
}

/**
 * The best copy a failed attempt produced.
 *
 * When every attempt is rejected, the words are usually fine: the geometry or
 * the action is not. Taking the longest text keeps the model's own sentence in
 * the film instead of replacing it with the arc's dry intent.
 */
export function titleFromAttempts(attempts: readonly unknown[]): string | null {
  let best: string | null = null;

  for (const document of attempts) {
    for (const scene of sceneBodies(document) ?? []) {
      if (!isRecord(scene) || !isRecord(scene['spec'])) {
        continue;
      }

      const elements = scene['spec']['elements'];

      if (!Array.isArray(elements)) {
        continue;
      }

      for (const element of elements) {
        if (!isRecord(element) || !isRecord(element['params'])) {
          continue;
        }

        const text = element['params']['text'];

        if (typeof text !== 'string') {
          continue;
        }

        const trimmed = text.replace(/\s+/g, ' ').trim();

        if (trimmed !== '' && (best === null || trimmed.length > best.length)) {
          best = trimmed;
        }
      }
    }
  }

  return best === null ? null : shortCopy(best);
}

/**
 * Copy that cannot fit its box is never shipped: the plate of the next element
 * covers the spilled words and the sentence stops being readable. Such a scene
 * goes to the marked fallback instead of a degraded frame.
 */
export function hasUnreadableCopy(violations: readonly string[]): boolean {
  return violations.some((violation) => violation.startsWith('переполнение:'));
}

/**
 * Keeps a scene that failed its gates: the picture stays, the length returns to
 * the plan, and the mark says the frame is under repair.
 */
export function degradeScene(
  scene: SpecScene,
  plannedSeconds: number,
  reasons: readonly string[],
): SpecScene {
  return {
    ...scene,
    durationSec: clampSeconds(plannedSeconds),
    degraded: reasonsOf(reasons.length === 0 ? ['degraded'] : reasons),
  };
}

/**
 * Last resort when every attempt failed before a valid composition existed:
 * the model's best sentence, typeset on the theme's stage. Ugly on purpose —
 * a marked placeholder keeps the film complete and is impossible to mistake
 * for a generated scene.
 */
export function fallbackScene(
  planned: PlannedScene,
  options: FallbackOptions = {},
): SpecScene {
  const theme = UI_THEMES[planned.theme];
  const reasons = options.reasons ?? ['fallback: композиция не собралась'];
  const title = options.title === undefined || options.title === null || options.title.trim() === ''
    ? shortCopy(planned.intent)
    : shortCopy(options.title);

  return {
    id: planned.id,
    device: 'spec',
    durationSec: clampSeconds(planned.seconds),
    revealSec: 2,
    themeId: planned.theme,
    spec: {
      kind: 'composition',
      focus: 'claim',
      elements: [
        {
          id: 'stage',
          primitive: 'stage',
          layout: { x: 0, y: 0, width: 1080, height: 1920 },
          params: { background: theme.background },
          states: ['rest'],
          transitions: ['appear'],
          operations: ['hold'],
          links: [],
        },
        {
          id: 'claim',
          primitive: 'label',
          layout: { x: 72, y: 800, width: 936, height: 236 },
          params: {
            text: title,
            token: 'card',
            tone: 'ink',
            weight: 600,
            align: 'left',
          },
          states: ['rest'],
          transitions: ['appear', 'type'],
          operations: ['reveal', 'type-on'],
          links: [],
        },
      ],
      sequence: [
        { element: 'stage', transition: 'appear' },
        { element: 'claim', transition: 'appear' },
        { element: 'claim', transition: 'type' },
      ],
    },
    degraded: reasonsOf(reasons),
    fallback: { reason: reasons[0] ?? 'fallback' },
  };
}

export type SceneMark = 'fallback' | 'degraded' | null;

/**
 * One frame, one mark: a fallback is always visible as ours, so it cannot ride
 * on the same asterisk as a repaired model scene.
 */
export function sceneMarkOf(scene: Pick<SpecScene, 'fallback' | 'degraded'>): SceneMark {
  if (scene.fallback !== undefined) {
    return 'fallback';
  }

  return scene.degraded === undefined ? null : 'degraded';
}

/** One attempt that produced a usable picture, with what is still wrong with it. */
export interface AttemptCandidate {
  readonly scene: SpecScene;
  readonly violations: readonly string[];
  readonly signature: string;
  readonly attempt: number;
}

/**
 * The ladder's rule, lexicographic and explicit: content first (guaranteed by
 * the caller), then the fewest violations, then a composition the film does not
 * use yet, and only then the later attempt — it saw more corrections.
 *
 * "Last attempt" was the old rule and it shipped the worst picture when the
 * model got weaker with every retry.
 */
export function preferAttempt(
  candidate: AttemptCandidate,
  current: AttemptCandidate | null,
  used: ReadonlySet<string>,
): boolean {
  if (current === null) {
    return true;
  }

  if (candidate.violations.length !== current.violations.length) {
    return candidate.violations.length < current.violations.length;
  }

  const candidateFresh = !used.has(candidate.signature);
  const currentFresh = !used.has(current.signature);

  if (candidateFresh !== currentFresh) {
    return candidateFresh;
  }

  return candidate.attempt > current.attempt;
}
