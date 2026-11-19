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

export interface PlannedScene {
  readonly id: string;
  readonly seconds: number;
  readonly theme: UiThemeId;
  readonly intent: string;
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
 * the scene's own intent, typeset on the theme's stage. It is ugly on purpose —
 * a marked placeholder keeps the film complete and is impossible to mistake
 * for a finished scene.
 */
export function fallbackScene(
  planned: PlannedScene,
  reasons: readonly string[] = ['fallback: no valid composition'],
): SpecScene {
  const theme = UI_THEMES[planned.theme];

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
            text: shortCopy(planned.intent),
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
  };
}
