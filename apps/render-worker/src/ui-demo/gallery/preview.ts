/**
 * A single primitive, placed on a frame: the sandbox needs a valid scene to
 * hand to `SpecRenderer`, and the layout is gallery furniture, not a contract.
 *
 * One scene, one element plus the stage. The sequence carries an `appear` cue
 * and, where the primitive has a behaviour worth seeing, a second cue that
 * animates it (type, fill, draw, drag).
 */

import type { PrimitiveId } from '../catalog.js';
import { CANVAS } from '../platform.js';
import type { SpecScene } from '../spec.js';
import { SCENE_FPS } from '../../video-target.js';
import type { UiThemeId } from '../themes.js';
import { PRIMITIVE_DEFAULTS, type GalleryValue } from './catalog.js';

export type PreviewParams = Readonly<Record<string, GalleryValue>>;

interface PreviewLayout {
  readonly x: number;
  readonly y: number;
  readonly width?: number;
  readonly height?: number;
  readonly align?: 'left' | 'center' | 'right';
}

/** Where one primitive sits in the frame; the demo keeps it inside safe bounds. */
const PREVIEW_LAYOUT: Readonly<Record<PrimitiveId, PreviewLayout>> = {
  stage: { x: 0, y: 0, width: CANVAS.width, height: CANVAS.height },
  card: { x: 150, y: 620, width: 780, height: 520 },
  pill: { x: 200, y: 760, width: 560, height: 96 },
  bubble: { x: 120, y: 700, width: 760, height: 140 },
  avatar: { x: 492, y: 820 },
  object: { x: 380, y: 800 },
  label: { x: 120, y: 780, width: 840, height: 180, align: 'left' },
  thumb: { x: 240, y: 960, width: 600 },
  track: { x: 240, y: 940, width: 600 },
  grid: { x: 240, y: 760, width: 600, height: 420 },
  line: { x: 200, y: 900 },
};

/** The second cue is the primitive's own behaviour; `null` means appear only. */
const DEMO_TRANSITION: Readonly<Record<PrimitiveId, string | null>> = {
  stage: null,
  card: 'appear',
  pill: 'type',
  bubble: 'type',
  avatar: 'appear',
  object: 'appear',
  label: 'type',
  thumb: 'drag',
  track: 'fill',
  grid: 'fill',
  line: 'draw',
};

export const PREVIEW_DURATION_SEC = 3;

export const PREVIEW_DURATION_FRAMES = Math.round(
  PREVIEW_DURATION_SEC * SCENE_FPS,
);

/** The demo runs to the end of the scene, so the loop restarts mid-motion. */
const DEMO_AT_SEC = 1;

function stageElement(params: PreviewParams) {
  return {
    id: 'stage',
    primitive: 'stage' as const,
    layout: { x: 0, y: 0, width: CANVAS.width, height: CANVAS.height },
    params: definedParams(params),
    states: [],
    transitions: ['appear'],
    operations: [],
    links: [],
  };
}

/**
 * An empty colour means "не задан": the primitive falls back to the theme. An
 * empty string would be an invalid CSS value and the surface would disappear.
 */
function definedParams(params: PreviewParams): PreviewParams {
  return Object.fromEntries(
    Object.entries(params).filter(([, value]) => value !== ''),
  );
}

export function previewScene(
  id: PrimitiveId,
  params: PreviewParams,
  themeId: UiThemeId,
): SpecScene {
  if (id === 'stage') {
    return {
      id: 'gallery-stage',
      device: 'spec',
      durationSec: PREVIEW_DURATION_SEC,
      revealSec: 1,
      themeId,
      spec: {
        kind: 'composition',
        elements: [stageElement(params)],
        sequence: [{ at: 0.1, element: 'stage', transition: 'appear' }],
      },
    };
  }

  const demo = DEMO_TRANSITION[id];

  return {
    id: 'gallery-preview',
    device: 'spec',
    durationSec: PREVIEW_DURATION_SEC,
    revealSec: 1,
    themeId,
    spec: {
      kind: 'composition',
      elements: [
        stageElement({ grid: true }),
        {
          id: 'demo',
          primitive: id,
          layout: { ...PREVIEW_LAYOUT[id] },
          params: definedParams(params),
          states: [],
          transitions: [],
          operations: [],
          links: [],
        },
      ],
      sequence: [
        { at: 0.1, element: 'demo', transition: 'appear' },
        ...(demo === null || demo === 'appear'
          ? []
          : [{ at: DEMO_AT_SEC, element: 'demo', transition: demo }]),
      ],
    },
  };
}

/** The sandbox opens on the same values the contract test keeps inside range. */
export function previewParams(id: PrimitiveId): Record<string, GalleryValue> {
  return { ...PRIMITIVE_DEFAULTS[id] };
}
