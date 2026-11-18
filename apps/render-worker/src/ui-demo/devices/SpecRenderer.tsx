import type { CSSProperties } from 'react';
import { useCurrentFrame, useVideoConfig } from 'remotion';
import { assetSrcByKey } from '../asset-src.js';
import type { ASSET_KEYS } from '../assets.js';
import { CRITICAL_SAFE_BOUNDS } from '../platform.js';
import { reveal } from '../timing.js';
import { lineEndpoints } from './line-geometry.js';
import {
  Avatar,
  Bubble,
  Card,
  Grid,
  Label,
  Line,
  ObjectLayer,
  Pill,
  Stage,
  Thumb,
  Track,
  type Tone,
} from '../primitives/index.js';
import type { SpecScene } from '../spec.js';
import type { UiTheme } from '../themes.js';
import type { TypeToken } from '../typography.js';

type Params = Readonly<Record<string, string | number | boolean>>;

function num(params: Params, key: string, fallback: number): number {
  const value = params[key];

  return typeof value === 'number' ? value : fallback;
}

function str(params: Params, key: string): string | undefined {
  const value = params[key];

  return typeof value === 'string' ? value : undefined;
}

function flag(params: Params, key: string): boolean {
  return params[key] === true;
}

/** Style parameters came from the model; they must not be replaced by defaults. */
function tokenOf(params: Params): TypeToken | undefined {
  const value = str(params, 'token');

  return value === undefined ? undefined : (value as TypeToken);
}

function toneOf(params: Params): Tone | undefined {
  const value = str(params, 'tone');

  return value === undefined ? undefined : (value as Tone);
}

/**
 * Only behaviours the renderer actually performs are accepted here. A transition
 * outside this set means the contract promised something the factory cannot do.
 */
export const RENDERED_TRANSITIONS = [
  'appear',
  'disappear',
  'draw',
  'fill',
  'type',
  'drag',
  'break',
  'release',
  'hold',
] as const;

/**
 * Entrance animations own opacity. A mid-scene move or scale must not restart
 * the fade: the element is already on screen, and `opacity: progress` made it
 * blink — visible, gone, visible again.
 */
function behaviorStyle(
  transition: string | undefined,
  progress: number,
): CSSProperties {
  switch (transition) {
    case 'disappear':
      return { opacity: 1 - progress };
    case 'appear':
      return {
        opacity: progress,
        transform: `translateY(${(1 - progress) * 24}px)`,
      };
    case 'move':
    case 'scale':
      /* Positional nudges read as a twitch mid-scene. Animation belongs to the
         entrance and the exit; a real action comes from the primitive that owns
         it — fill, draw, type, break, drag. */
      return {};
    case 'drag':
      return { transform: `translateX(${(1 - progress) * -240}px)` };
    /* draw / fill / type / break animate their own geometry, not opacity. */
    case 'draw':
    case 'fill':
    case 'type':
    case 'break':
    case 'activate':
    case 'hold':
      return {};
    default:
      return { opacity: progress };
  }
}

/** Typing speed: a full line takes this long, regardless of its length. */
const TYPE_FRAMES = 24;

/**
 * Geometry has one owner: the cue that animates it.
 *
 * A primitive that declares a `fill`, `draw`, `break` or `release` cue starts
 * empty and animates from zero at that cue — the appearance cue owns opacity and
 * nothing else. Previously the track showed full at `appear`, then reset to zero
 * and filled: the same "initialise, then animate" bug the text had.
 */
function cueProgress(
  cues: ReadonlyArray<{ start: number; transition: string }>,
  transition: string,
  frame: number,
  frames = 24,
  /** State when the cue is absent: full for fill/draw, empty for break/release. */
  absent = 1,
): number {
  const cue = cues.find((item) => item.transition === transition);

  if (cue === undefined) {
    return absent;
  }

  return Math.min(1, Math.max(0, (frame - cue.start) / Math.max(1, frames)));
}

interface TextState {
  readonly text: string | undefined;
  /** Text with a `type` cue never appears as a block first. */
  readonly typedOnly: boolean;
  /** Opacity owned by typing, or null when the entrance owns it. */
  readonly opacity: number | null;
}

/**
 * One entrance per text element. A cue list like `appear @0.5` + `type @1.4`
 * used to show the whole line and then retype it from empty. If the element
 * declares typing, it types: nothing before the cue, characters after it.
 */
function resolveText(
  cues: ReadonlyArray<{ start: number; transition: string; text?: string }>,
  frame: number,
  base: string | undefined,
): TextState {
  const typing = cues
    .filter((cue) => cue.transition === 'type' || cue.text !== undefined)
    .filter((cue) => cue.start <= frame);

  const last = typing.at(-1);

  if (last === undefined) {
    const hasTyping = cues.some((cue) => cue.transition === 'type');

    return hasTyping
      ? { text: undefined, typedOnly: true, opacity: 0 }
      : { text: base, typedOnly: false, opacity: null };
  }

  const progress = reveal(frame, last.start, TYPE_FRAMES);
  const full = last.text ?? base;

  return {
    text: full === undefined ? full : full.slice(0, Math.ceil(full.length * progress)),
    typedOnly: true,
    opacity: 1,
  };
}

/**
 * Renders a `CompositionSpec` with contracted primitives. The spec is validated
 * by `specSceneSchema` before it reaches this component, so an unknown
 * primitive, parameter or operation can never be drawn.
 */
export function SpecRenderer({
  scene,
  theme,
}: {
  scene: SpecScene;
  theme: UiTheme;
}) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  /* One element can carry several cues (fill, then break, then release); the
     latest cue that has already started drives the visible behaviour. */
  const cues = new Map<
    string,
    Array<{ start: number; transition: string; text?: string }>
  >();

  for (const step of scene.spec.sequence) {
    const list = cues.get(step.element) ?? [];

    list.push({
      start: Math.round((step.at ?? 0) * fps),
      transition: step.transition,
      ...(step.text === undefined ? {} : { text: step.text }),
    });
    cues.set(step.element, list);
  }

  for (const list of cues.values()) {
    list.sort((left, right) => left.start - right.start);
  }

  return (
    <div
      data-ui-device={scene.device}
      data-ui-scene={scene.id}
      style={{ position: 'absolute', inset: 0 }}
    >
      {scene.spec.elements.map((element) => {
        const list = cues.get(element.id) ?? [];
        const index = list.reduce(
          (active, cue, cueIndex) => (cue.start <= frame ? cueIndex : active),
          -1,
        );
        const cue = index < 0 ? undefined : list[index];
        const start = cue?.start ?? list[0]?.start ?? 0;
        const transition = cue?.transition;
        const progress = reveal(frame, start, 6);
        const params = element.params as Params;
        /* A cue can carry its own copy: counters, prices and totals change with
           the sequence instead of spawning one element per value. */
        const textState = resolveText(list, frame, str(params, 'text'));
        const text = textState.text;
        const style: CSSProperties = {
          position: 'absolute',
          left: element.layout.x,
          top: element.layout.y,
          ...(element.layout.width === undefined ? {} : { width: element.layout.width }),
          ...(element.layout.height === undefined ? {} : { height: element.layout.height }),
          ...behaviorStyle(transition, progress),
        };
        /* Typing owns the entrance: the element must not fade in as a block and
           then retype itself. The exit still wins. */
        const textOpacity =
          transition === 'disappear' ? 1 - progress : textState.opacity;
        const textStyle: CSSProperties = {
          ...style,
          ...(textOpacity === null ? {} : { opacity: textOpacity }),
          ...(element.layout.align === undefined ? {} : { textAlign: element.layout.align }),
        };

        switch (element.primitive) {
          case 'stage':
            return (
              <Stage
                key={element.id}
                theme={theme}
                grid={flag(params, 'grid')}
                vignette={flag(params, 'vignette')}
                markers={{ surface: element.id }}
              />
            );
          case 'card':
            return (
              <Card
                key={element.id}
                theme={theme}
                background={str(params, 'background')}
                radius={num(params, 'radius', 40)}
                padding={num(params, 'padding', 40)}
                border={str(params, 'border')}
                shadow={
                  (str(params, 'shadow') as 'none' | 'soft' | 'strong' | undefined) ??
                  'none'
                }
                shadowColor={str(params, 'shadowColor')}
                style={style}
                markers={{ surface: element.id }}
              />
            );
          case 'label':
            return (
              <Label
                key={element.id}
                theme={theme}
                token={tokenOf(params)}
                tone={toneOf(params)}
                color={str(params, 'textColor')}
                weight={
                  typeof params.weight === 'number' ? params.weight : undefined
                }
                align={
                  (str(params, 'align') as 'left' | 'center' | 'right' | undefined) ?? undefined
                }
                text={text}
                style={textStyle}
                fontScale={num(params, 'fontScale', 1)}
                elementId={element.id}
                markers={{ critical: 'spec-text' }}
              />
            );
          case 'pill':
            return (
              <Pill
                key={element.id}
                theme={theme}
                text={text}
                background={str(params, 'background')}
                textColor={str(params, 'textColor')}
                tone={toneOf(params)}
                radius={num(params, 'radius', 999)}
                paddingX={num(params, 'paddingX', 40)}
                paddingY={num(params, 'paddingY', 18)}
                gap={num(params, 'gap', 18)}
                token={tokenOf(params)}
                shadow={
                  (str(params, 'shadow') as 'none' | 'soft' | 'strong' | undefined) ??
                  'none'
                }
                style={{
                  ...textStyle,
                  /* The surface wraps its text instead of cutting it: the
                     declared width is a minimum, the frame is the maximum. */
                  width: 'auto',
                  maxWidth: CRITICAL_SAFE_BOUNDS.right - CRITICAL_SAFE_BOUNDS.left,
                }}
                markers={{ critical: 'spec-text', surface: element.id }}
              />
            );
          case 'bubble':
            return (
              <Bubble
                key={element.id}
                theme={theme}
                text={text}
                side={str(params, 'side') === 'left' ? 'left' : 'right'}
                background={str(params, 'background')}
                textColor={str(params, 'textColor')}
                tone={toneOf(params)}
                token={tokenOf(params)}
                style={textStyle}
                markers={{ critical: 'spec-text' }}
              />
            );
          case 'avatar':
            return (
              <Avatar
                key={element.id}
                src={assetSrcByKey((str(params, 'asset') ?? 'owl') as (typeof ASSET_KEYS)[number])}
                size={num(params, 'size', 96)}
                ring={flag(params, 'ring')}
                style={style}
              />
            );
          case 'object':
            return (
              <ObjectLayer
                key={element.id}
                src={assetSrcByKey((str(params, 'asset') ?? 'owl') as (typeof ASSET_KEYS)[number])}
                size={num(params, 'size', 320)}
                rotation={num(params, 'rotation', 0)}
                shadow={flag(params, 'shadow')}
                style={style}
              />
            );
          case 'thumb': {
            const size = num(params, 'size', 28);
            /* `drag` reads the travel from the declared layout box; the knob is
               at the start until its drag cue, then travels, then drops. */
            const travel =
              element.layout.width === undefined
                ? null
                : Math.max(0, element.layout.width - size);
            const dragged = cueProgress(list, 'drag', frame, 30, 0);
            const released = cueProgress(list, 'release', frame, 20, 0);
            const moved = Math.max(dragged, released > 0 ? 1 : 0);
            const fall = released;

            return (
              <Thumb
                key={element.id}
                size={size}
                color={str(params, 'color')}
                style={{
                  ...style,
                  /* The layout box is the travel range, not the knob size. */
                  width: size,
                  height: size,
                  opacity: 1 - fall,
                  ...(travel === null
                    ? {}
                    : {
                        transform: `translateX(${moved * travel}px) translateY(${fall * 560}px) rotate(${fall * 24}deg)`,
                      }),
                }}
              />
            );
          }
          case 'track': {
            const fill = num(params, 'fill', 0) * cueProgress(list, 'fill', frame);
            const breakProgress = cueProgress(list, 'break', frame, 24, 0);

            return (
              <Track
                key={element.id}
                theme={theme}
                length={num(params, 'length', 600)}
                thickness={num(params, 'thickness', 8)}
                color={str(params, 'color')}
                breakAt={
                  typeof params.breakAt === 'number' ? params.breakAt : undefined
                }
                breakProgress={breakProgress}
                fill={fill}
                style={style}
              />
            );
          }
          case 'grid': {
            const columns = num(params, 'columns', 4);
            const rows = num(params, 'rows', 3);
            const cells = Array.from({ length: columns * rows }, (_, index) => index);

            return (
              <Grid
                key={element.id}
                columns={columns}
                rows={rows}
                gap={num(params, 'gap', 16)}
                style={style}
                markers={{ surface: element.id }}
              >
                {cells.map((index) => {
                  /* A grid with a fill cue is empty until that cue reaches the
                     cell, then fills in order. The entrance never fills it. */
                  const filled = cueProgress(list, 'fill', frame, 24);
                  const cellIn = Math.min(
                    1,
                    Math.max(0, (filled * cells.length - index) / 2),
                  );

                  return (
                    <div
                      key={index}
                      style={{
                        borderRadius: 10,
                        background: theme.accent,
                        opacity: cellIn * (index < cells.length * 0.9 ? 1 : 0.25),
                      }}
                    />
                  );
                })}
              </Grid>
            );
          }
          case 'line': {
            /* Line coordinates are absolute frame points, like SVG: a foreign
               author writes where the line is. `layout` stays the bounding box
               (validated and used by the quality gate), never an offset. */
            const drawProgress = cueProgress(list, 'draw', frame);
            const points = lineEndpoints(params, drawProgress);

            return (
              <Line
                key={element.id}
                color={str(params, 'color') ?? theme.accent}
                width={num(params, 'width', 2)}
                dashed={flag(params, 'dashed')}
                fromX={points.fromX}
                fromY={points.fromY}
                toX={points.toX}
                toY={points.toY}
                /* The SVG covers the frame; only the line's own points move. */
                style={{
                  position: 'absolute',
                  left: 0,
                  top: 0,
                  width: 1080,
                  height: 1920,
                  ...behaviorStyle(transition, progress),
                }}
              />
            );
          }
          default:
            return null;
        }
      })}
    </div>
  );
}

