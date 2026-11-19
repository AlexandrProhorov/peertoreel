import type { CSSProperties, ReactNode } from 'react';
import { Img } from 'remotion';
import { accentPlate, accentPlateInk, type UiTheme } from '../themes.js';
import { textStyle, type TypeToken } from '../typography.js';

/**
 * Primitive layer: styled atoms driven by the contracts in `catalog.ts`.
 *
 * Appearance comes from parameters, `style` is for positioning/transforms and
 * animation only, and `markers` carries the linter annotations. A primitive
 * never decides its own colours or type — it reads the theme and the type scale.
 */

export interface PrimitiveMarkers {
  readonly critical?: string;
  readonly within?: string;
  readonly surface?: string;
  readonly decoration?: string;
}

export interface PrimitiveBase {
  readonly style?: CSSProperties;
  readonly children?: ReactNode;
  readonly markers?: PrimitiveMarkers;
}

function markerProps(markers: PrimitiveMarkers | undefined): Record<string, string> {
  if (markers === undefined) {
    return {};
  }

  return {
    ...(markers.critical === undefined ? {} : { 'data-ui-critical': markers.critical }),
    ...(markers.within === undefined ? {} : { 'data-ui-within': markers.within }),
    ...(markers.surface === undefined ? {} : { 'data-ui-surface': markers.surface }),
    ...(markers.decoration === undefined ? {} : { 'data-ui-decoration': markers.decoration }),
  };
}

const TONE_COLORS: Record<string, (theme: UiTheme) => string> = {
  ink: (theme) => theme.ink,
  muted: (theme) => theme.muted,
  accent: (theme) => theme.accent,
  surface: (theme) => theme.surfaceInk,
  'accent-ink': (theme) => theme.accentInk,
};

export type Tone = keyof typeof TONE_COLORS;

function toneColor(theme: UiTheme, tone: Tone | undefined): string | undefined {
  return tone === undefined ? undefined : TONE_COLORS[tone]?.(theme);
}

const SHADOWS: Record<string, string> = {
  none: 'none',
  soft: '0 16px 50px rgba(0, 0, 0, 0.28)',
  strong: '0 32px 90px rgba(0, 0, 0, 0.28)',
};

export function Stage({
  theme,
  grid,
  vignette,
  style,
  children,
  markers,
}: PrimitiveBase & {
  theme: UiTheme;
  grid?: boolean;
  vignette?: boolean;
}) {
  return (
    <div
      {...markerProps(markers)}
      style={{
        position: 'absolute',
        inset: 0,
        backgroundColor: theme.background,
        ...(grid === true
          ? {
              backgroundImage: `linear-gradient(${theme.grid} 1px, transparent 1px), linear-gradient(90deg, ${theme.grid} 1px, transparent 1px)`,
              backgroundSize: '96px 96px',
            }
          : {}),
        ...(vignette === true
          ? { boxShadow: 'inset 0 0 300px 90px rgba(0,0,0,0.55)' }
          : {}),
        ...style,
      }}
    >
      {children}
    </div>
  );
}

/** Ink for a caption follows the surface it sits on; the model never picks it. */
function inkOn(background: string): string {
  const match = /^#([0-9a-f]{6})$/i.exec(background);

  if (match?.[1] === undefined) {
    return '#0B0B0C';
  }

  const value = Number.parseInt(match[1], 16);
  const channel = (raw: number): number => {
    const value255 = raw / 255;

    return value255 <= 0.03928 ? value255 / 12.92 : ((value255 + 0.055) / 1.055) ** 2.4;
  };
  const luminance =
    0.2126 * channel((value >> 16) & 255) +
    0.7152 * channel((value >> 8) & 255) +
    0.0722 * channel(value & 255);

  return luminance > 0.35 ? '#0B0B0C' : '#FFFFFF';
}

export function Card({
  theme,
  background,
  radius = 40,
  padding = 40,
  border,
  shadow = 'none',
  shadowColor,
  text,
  token = 'card',
  fontScale = 1,
  align,
  elementId,
  style,
  children,
  markers,
}: PrimitiveBase & {
  theme: UiTheme;
  background?: string;
  radius?: number;
  padding?: number;
  border?: string;
  shadow?: keyof typeof SHADOWS;
  shadowColor?: string;
  /** The caption belongs to the surface, so the padding applies to it. */
  text?: string;
  token?: TypeToken;
  fontScale?: number;
  align?: 'left' | 'center' | 'right';
  /** Gives the measurement pass an owner for the caption's overflow. */
  elementId?: string;
}) {
  const fill = background ?? theme.surface;
  const base = textStyle(token, inkOn(fill));
  const { fontSize, ...rest } = base;

  return (
    <div
      {...markerProps(markers)}
      style={{
        background: fill,
        borderRadius: radius,
        padding,
        border: border === undefined ? undefined : `2px solid ${border}`,
        boxShadow:
          shadow === 'strong' && shadowColor !== undefined
            ? `0 32px 90px ${shadowColor}`
            : SHADOWS[shadow],
        ...style,
      }}
    >
      {children ?? (text === undefined ? null : (
        <span
          {...markerProps({ critical: 'spec-text' })}
          {...(elementId === undefined ? {} : { 'data-ui-element': elementId })}
          style={{
            ...rest,
            /* The card's height is not the line's height: the token sets the
               size and fontScale is the repair lever. */
            ...(typeof fontSize === 'number' ? { fontSize: fontSize * fontScale } : {}),
            display: 'block',
            ...(align === undefined ? {} : { textAlign: align }),
          }}
        >
          {text}
        </span>
      ))}
    </div>
  );
}

export function Pill({
  theme,
  background,
  textColor,
  tone,
  border,
  radius = 999,
  paddingX = 40,
  paddingY = 18,
  gap = 18,
  shadow = 'none',
  token = 'label',
  weight,
  text,
  style,
  children,
  markers,
}: PrimitiveBase & {
  theme: UiTheme;
  background?: string;
  textColor?: string;
  /** Semantic ink; an explicit `textColor` wins over the tone. */
  tone?: Tone;
  border?: string;
  radius?: number;
  paddingX?: number;
  paddingY?: number;
  gap?: number;
  shadow?: keyof typeof SHADOWS;
  token?: TypeToken;
  weight?: number;
  text?: string;
}) {
  return (
    <div
      {...markerProps({ surface: markers?.surface })}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap,
        padding: `${paddingY}px ${paddingX}px`,
        borderRadius: radius,
        background: background ?? theme.surface,
        border: border === undefined ? undefined : `2px solid ${border}`,
        boxShadow: SHADOWS[shadow],
        ...style,
        /* The pill is a surface: it must contain its own text, so a declared
           height is a minimum, never a lid the text spills out of. */
        height: undefined,
        minHeight: style?.height,
      }}
    >
      {children ?? (
        <span
          /* Typography lives on the text node: measuring the wrapper reports
             the inherited browser default, not the font the pill uses. */
          {...markerProps({ critical: markers?.critical })}
          style={{
            ...textStyle(token, textColor ?? toneColor(theme, tone) ?? theme.surfaceInk),
            ...(weight === undefined ? {} : { fontWeight: weight }),
          }}
        >
          {text}
        </span>
      )}
    </div>
  );
}

export function Label({
  theme,
  token = 'body',
  tone,
  color,
  weight,
  align,
  text,
  fontScale = 1,
  mark,
  elementId,
  style,
  children,
  markers,
}: PrimitiveBase & {
  theme: UiTheme;
  token?: TypeToken;
  tone?: Tone;
  color?: string;
  weight?: number;
  align?: 'left' | 'center' | 'right';
  text?: string;
  /** Shrinks the token size; the auto-fit pass owns this value. */
  fontScale?: number;
  /** A marker plate behind the words: accent ink on any theme. */
  mark?: boolean;
  elementId?: string;
}) {
  const base = textStyle(token, color ?? toneColor(theme, tone) ?? theme.ink);
  const { fontSize, ...rest } = base;

  return (
    <div
      {...markerProps(markers)}
      {...(elementId === undefined ? {} : { 'data-ui-element': elementId })}
      style={{
        ...rest,
        /* The size is always written: dropping it when scale is 1 fell back to
           the browser default and made every label 16px. */
        ...(typeof fontSize === 'number'
          ? { fontSize: fontSize * fontScale }
          : {}),
        ...(weight === undefined ? {} : { fontWeight: weight }),
        ...(align === undefined ? {} : { textAlign: align }),
        ...style,
      }}
    >
      {children ?? (mark === true && text !== undefined ? (
        <span
          style={{
            background: accentPlate(theme),
            color: accentPlateInk(theme),
            padding: '4px 18px',
            borderRadius: 14,
          }}
        >
          {text}
        </span>
      ) : text)}
    </div>
  );
}

export function Bubble({
  theme,
  side = 'right',
  background,
  textColor,
  tone,
  token = 'bubble',
  text,
  style,
  children,
  markers,
}: PrimitiveBase & {
  theme: UiTheme;
  side?: 'left' | 'right';
  background?: string;
  textColor?: string;
  /** Semantic ink; an explicit `textColor` wins over the tone. */
  tone?: Tone;
  token?: TypeToken;
  text?: string;
}) {
  return (
    <div
      {...markerProps(markers)}
      style={{
        width: 'fit-content',
        maxWidth: 700,
        background: background ?? theme.accent,
        color: textColor ?? toneColor(theme, tone) ?? theme.accentInk,
        padding: '26px 34px',
        borderRadius: 40,
        borderTopLeftRadius: side === 'left' ? 16 : 40,
        borderTopRightRadius: side === 'right' ? 16 : 40,
        ...textStyle(token),
        ...style,
      }}
    >
      {children ?? text}
    </div>
  );
}

export function Avatar({
  src,
  size = 96,
  ring,
  background,
  style,
  markers,
}: {
  src: string;
  size?: number;
  ring?: boolean;
  background?: string;
  style?: CSSProperties;
  markers?: PrimitiveMarkers;
}) {
  return (
    <Img
      src={src}
      {...markerProps(markers)}
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        objectFit: 'contain',
        background,
        border: ring === true ? '2px solid rgba(255,255,255,0.4)' : undefined,
        flexShrink: 0,
        ...style,
      }}
    />
  );
}

export function ObjectLayer({
  src,
  size = 320,
  rotation = 0,
  shadow = false,
  style,
  markers,
}: {
  src: string;
  size?: number;
  rotation?: number;
  shadow?: boolean;
  style?: CSSProperties;
  markers?: PrimitiveMarkers;
}) {
  return (
    <Img
      src={src}
      {...markerProps(markers)}
      style={{
        width: size,
        height: size,
        objectFit: 'contain',
        transform: `rotate(${rotation}deg)`,
        filter: shadow ? 'drop-shadow(0 30px 60px rgba(0, 0, 0, 0.3))' : undefined,
        ...style,
      }}
    />
  );
}

export function Thumb({
  size = 28,
  color,
  style,
  markers,
}: {
  size?: number;
  color?: string;
  style?: CSSProperties;
  markers?: PrimitiveMarkers;
}) {
  return (
    <div
      {...markerProps(markers)}
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        background: color ?? '#FFFFFF',
        ...style,
      }}
    />
  );
}

export function Track({
  theme,
  length = 600,
  thickness = 8,
  color,
  fill = 0,
  breakAt,
  breakProgress = 0,
  style,
  markers,
}: {
  theme: UiTheme;
  length?: number;
  thickness?: number;
  color?: string;
  fill?: number;
  /** Fraction of the length where the rail snaps when it breaks. */
  breakAt?: number;
  /** 0 = intact rail, 1 = fully split and dropped. */
  breakProgress?: number;
  style?: CSSProperties;
  markers?: PrimitiveMarkers;
}) {
  const ratio = Math.min(1, Math.max(0, fill));
  const fillColor = color ?? theme.accent;
  const snapped = Math.min(1, Math.max(0, breakProgress));

  if (snapped > 0) {
    const split = Math.min(1, Math.max(0, breakAt ?? 0.5));
    const leftLength = length * split;
    const rightLength = length - leftLength;
    const gap = snapped * 40;
    const drop = snapped * 26;
    const turn = snapped * 3.5;
    /* Fill is measured against the whole rail, so each half keeps its share. */
    const leftFill = split === 0 ? 0 : Math.min(1, ratio / split);
    const rightFill =
      split === 1 ? 0 : Math.max(0, Math.min(1, (ratio - split) / (1 - split)));
    const segment = (width: number): CSSProperties => ({
      width,
      height: thickness,
      borderRadius: thickness / 2,
      background: theme.border,
      overflow: 'hidden',
    });
    const bar = (width: number, segmentFill: number): CSSProperties => ({
      width: `${segmentFill * 100}%`,
      height: '100%',
      borderRadius: thickness / 2,
      background: fillColor,
    });

    return (
      <div
        {...markerProps(markers)}
        style={{
          position: 'relative',
          width: length,
          height: thickness,
          ...style,
        }}
      >
        <div
          style={{
            ...segment(leftLength),
            position: 'absolute',
            left: 0,
            top: 0,
            transform: `translate(${-gap}px, ${drop}px) rotate(${turn}deg)`,
            transformOrigin: 'right center',
          }}
        >
          <div style={bar(leftLength, leftFill)} />
        </div>
        <div
          style={{
            ...segment(rightLength),
            position: 'absolute',
            left: leftLength,
            top: 0,
            transform: `translate(${gap}px, ${drop * 1.4}px) rotate(${-turn}deg)`,
            transformOrigin: 'left center',
          }}
        >
          <div style={bar(rightLength, rightFill)} />
        </div>
      </div>
    );
  }

  return (
    <div
      {...markerProps(markers)}
      style={{
        width: length,
        height: thickness,
        borderRadius: thickness / 2,
        background: theme.border,
        ...style,
      }}
    >
      <div
        style={{
          width: `${ratio * 100}%`,
          height: '100%',
          borderRadius: thickness / 2,
          background: fillColor,
        }}
      />
    </div>
  );
}

export function Grid({
  columns = 4,
  rows = 3,
  gap = 16,
  style,
  children,
  markers,
}: PrimitiveBase & {
  columns?: number;
  rows?: number;
  gap?: number;
}) {
  return (
    <div
      {...markerProps(markers)}
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${columns}, 1fr)`,
        gridTemplateRows: `repeat(${rows}, 1fr)`,
        gap,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export function Line({
  color,
  width = 2,
  dashed = false,
  fromX = 0,
  fromY = 0,
  toX = 600,
  toY = 0,
  style,
  markers,
}: {
  color: string;
  width?: number;
  dashed?: boolean;
  fromX?: number;
  fromY?: number;
  toX?: number;
  toY?: number;
  style?: CSSProperties;
  markers?: PrimitiveMarkers;
}) {
  return (
    <svg
      {...markerProps(markers)}
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', ...style }}
      aria-hidden
    >
      <line
        x1={fromX}
        y1={fromY}
        x2={toX}
        y2={toY}
        stroke={color}
        strokeWidth={width}
        strokeDasharray={dashed ? `${width * 4} ${width * 3}` : undefined}
      />
    </svg>
  );
}
