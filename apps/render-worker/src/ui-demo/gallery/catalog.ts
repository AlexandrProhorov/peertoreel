/**
 * The gallery catalogue: one description of a primitive, used twice — the model
 * reads it in the director prompt, the web sandbox renders it as a card.
 *
 * A second hand-written copy would drift the moment a parameter changes, so the
 * prompt brief is generated from these docs (`director/contract-brief.ts`) and
 * the Angular page reads the exported JSON (`ui:gallery`).
 */

import { ASSET_KEYS } from '../assets.js';
import {
  MAX_ELEMENTS_PER_SCENE,
  MAX_INSTANCES_PER_PRIMITIVE,
  PRIMITIVES,
  type ParameterSpec,
  type PrimitiveContract,
  type PrimitiveId,
} from '../catalog.js';
import { CANVAS } from '../platform.js';
import { UI_THEMES } from '../themes.js';
import { SCENE_FPS } from '../../video-target.js';

/**
 * Layer B: what a primitive is for. One line, because the model has to choose
 * between eleven of them and a paragraph per primitive makes the choice worse.
 */
export const PRIMITIVE_SEMANTICS: Readonly<Record<PrimitiveId, string>> = {
  stage: 'фоновая поверхность сцены',
  card: 'видимая поверхность, контейнер или объект',
  pill: 'компактный маркированный текстовый элемент',
  bubble: 'реплика или сообщение',
  avatar: 'аватар участника из локальной библиотеки',
  object: 'объёмный объект из локальной библиотеки',
  label: 'текстовый смысловой акцент',
  thumb: 'положение или указатель на шкале',
  track: 'заполнение, величина, прогресс',
  grid: 'регулярная пространственная структура',
  line: 'связь, направление, траектория; координаты точек — в кадре, как в SVG',
};

/**
 * Assets need a key from the local library; a director cannot invent one, so
 * these primitives never reach the prompt.
 */
export const FORBIDDEN_PRIMITIVES = ['avatar', 'object'] as const;

/**
 * Starting values for the sandbox. A contract declares ranges, not defaults, so
 * the gallery owns the example: every value is inside the declared range and
 * the test fails if one drifts out.
 */
export const PRIMITIVE_DEFAULTS: Readonly<
  Record<PrimitiveId, Readonly<Record<string, string | number | boolean>>>
> = {
  stage: { grid: true, vignette: false },
  card: { radius: 40, padding: 40, shadow: 'soft' },
  pill: {
    text: 'нейросети',
    token: 'card',
    tone: 'ink',
    radius: 999,
    paddingX: 40,
    paddingY: 18,
    gap: 18,
    shadow: 'soft',
  },
  bubble: {
    text: 'Он ответил за секунду',
    side: 'left',
    token: 'bubble',
    textColor: '#0B0B0C',
  },
  avatar: { asset: 'owl', size: 96, ring: true },
  object: { asset: 'owl', size: 320, rotation: 0, shadow: true },
  label: {
    text: 'Сцена за 5 секунд',
    token: 'headline',
    tone: 'ink',
    weight: 800,
    align: 'left',
    fontScale: 1,
    textColor: '#FFFFFF',
  },
  thumb: { size: 28, axis: 'x' },
  track: { length: 600, thickness: 8, fill: 0.6, breakAt: 0.7 },
  grid: { columns: 4, rows: 3, gap: 16, cell: 'dot' },
  line: {
    /* Frame coordinates: the sandbox previews the line where the frame is, not
       at an offset of the layout box. */
    fromX: 200,
    fromY: 900,
    toX: 800,
    toY: 1020,
    width: 3,
    dashed: false,
  },
};

/**
 * The iframe protocol is generated once: Angular posts on this channel, the
 * playground listens on it. A typo in one side would silence the preview, so
 * the name travels with the catalogue instead of being copied into two apps.
 */
export const PREVIEW_CHANNEL = 'ui-gallery';

/** Where the built playground lands inside the web app's public assets. */
export const PREVIEW_PATH = 'gallery/playground/index.html';

export type GalleryValue = string | number | boolean;

export interface GalleryParameter {
  readonly name: string;
  readonly type: ParameterSpec['type'];
  readonly min?: number;
  readonly max?: number;
  readonly values?: readonly (string | number)[];
  readonly maxLength?: number;
  /** The sandbox starts here; a contract only declares the allowed range. */
  readonly initial: GalleryValue;
}

export interface GalleryPrimitive {
  readonly id: PrimitiveId;
  readonly semantics: string;
  /** False for primitives the director may not use (local assets only). */
  readonly offeredToDirector: boolean;
  readonly parameters: readonly GalleryParameter[];
  readonly states: readonly string[];
  readonly transitions: readonly string[];
  readonly operations: readonly string[];
  /** Exactly the lines the model reads, or empty when the primitive is hidden. */
  readonly prompt: readonly string[];
}

export interface GalleryTheme {
  readonly id: string;
  readonly background: string;
  readonly ink: string;
  readonly muted: string;
  readonly surface: string;
  readonly accent: string;
  readonly accentInk: string;
}

export interface GalleryCatalog {
  readonly schemaVersion: 1;
  readonly canvas: { readonly width: number; readonly height: number };
  readonly fps: number;
  readonly maxElementsPerScene: number;
  readonly maxInstancesPerPrimitive: number;
  readonly assets: readonly string[];
  readonly themes: readonly GalleryTheme[];
  readonly primitives: readonly GalleryPrimitive[];
  readonly preview: {
    readonly channel: string;
    readonly path: string;
  };
}

/** Same rendering as the prompt: one parameter, one line, no prose. */
function parameterLine(name: string, parameter: ParameterSpec): string {
  const parts: string[] = [parameter.type];

  if (parameter.min !== undefined || parameter.max !== undefined) {
    parts.push(`${parameter.min ?? '*'}..${parameter.max ?? '*'}`);
  }

  if (parameter.values !== undefined) {
    parts.push(`одно из ${JSON.stringify(parameter.values)}`);
  }

  if (parameter.maxLength !== undefined) {
    parts.push(`до ${parameter.maxLength} символов`);
  }

  return `${name}: ${parts.join(', ')}`;
}

export function primitivePromptLines(
  id: PrimitiveId,
  contract: PrimitiveContract,
): readonly string[] {
  const params = Object.entries(contract.parameters)
    .map(([name, parameter]) => `    ${parameterLine(name, parameter)}`)
    .join('\n');

  return [
    `- ${id} — ${PRIMITIVE_SEMANTICS[id]}`,
    params,
    `    переходы: ${contract.transitions.join(', ')}`,
    `    состояния: ${contract.states.join(', ')}`,
    `    операции: ${contract.operations.join(', ')}`,
  ];
}

function galleryParameter(
  name: string,
  parameter: ParameterSpec,
  initial: GalleryValue,
): GalleryParameter {
  return {
    name,
    type: parameter.type,
    ...(parameter.min === undefined ? {} : { min: parameter.min }),
    ...(parameter.max === undefined ? {} : { max: parameter.max }),
    ...(parameter.values === undefined ? {} : { values: parameter.values }),
    ...(parameter.maxLength === undefined
      ? {}
      : { maxLength: parameter.maxLength }),
    initial,
  };
}

export function isOfferedToDirector(id: PrimitiveId): boolean {
  return !(FORBIDDEN_PRIMITIVES as readonly string[]).includes(id);
}

function buildPrimitive(id: PrimitiveId): GalleryPrimitive {
  const contract = PRIMITIVES[id];
  const defaults = PRIMITIVE_DEFAULTS[id];
  const offered = isOfferedToDirector(id);

  return {
    id,
    semantics: PRIMITIVE_SEMANTICS[id],
    offeredToDirector: offered,
    parameters: Object.entries(contract.parameters).map(([name, parameter]) =>
      galleryParameter(name, parameter, defaults[name] ?? defaultFor(parameter)),
    ),
    states: contract.states,
    transitions: contract.transitions,
    operations: contract.operations,
    prompt: offered ? primitivePromptLines(id, contract) : [],
  };
}

/** Only reached if a default is missing: the test reports it as a drift. */
function defaultFor(parameter: ParameterSpec): GalleryValue {
  switch (parameter.type) {
    case 'number':
      return parameter.min ?? 0;
    case 'boolean':
      return false;
    case 'enum':
      return parameter.values?.[0] ?? '';
    default:
      return '';
  }
}

export function buildGalleryCatalog(): GalleryCatalog {
  return {
    schemaVersion: 1,
    canvas: { width: CANVAS.width, height: CANVAS.height },
    fps: SCENE_FPS,
    maxElementsPerScene: MAX_ELEMENTS_PER_SCENE,
    maxInstancesPerPrimitive: MAX_INSTANCES_PER_PRIMITIVE,
    assets: ASSET_KEYS,
    themes: Object.values(UI_THEMES).map((theme) => ({
      id: theme.id,
      background: theme.background,
      ink: theme.ink,
      muted: theme.muted,
      surface: theme.surface,
      accent: theme.accent,
      accentInk: theme.accentInk,
    })),
    primitives: (Object.keys(PRIMITIVES) as PrimitiveId[]).map(buildPrimitive),
    preview: { channel: PREVIEW_CHANNEL, path: PREVIEW_PATH },
  };
}
