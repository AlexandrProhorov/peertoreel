import type {
  KineticTypographyParams,
  StoryboardScene,
  StoryboardStyle,
} from '@peertoreel/contracts';
import { normalizeStoryboardToken } from '@peertoreel/contracts';
import {
  AbsoluteFill,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import type { CSSProperties, ReactNode } from 'react';

interface KineticTypographyProps {
  scene: StoryboardScene;
  style: StoryboardStyle;
  params: KineticTypographyParams;
}

function backgroundColors(style: StoryboardStyle): [string, string] {
  const background = style.palette.background;

  return [background[0] ?? '#0b1220', background[1] ?? background[0] ?? '#16233c'];
}

function accentWordSet(words: readonly string[]): Set<string> {
  return new Set(
    words
      .map((word) => normalizeStoryboardToken(word))
      .filter((word) => word.length > 0),
  );
}

function renderWords(
  text: string,
  accentWords: ReadonlySet<string>,
  accentColor: string,
): ReactNode {
  const words = text.split(/\s+/).filter((word) => word.length > 0);

  return words.map((word, index) => {
    const accented = accentWords.has(normalizeStoryboardToken(word));

    return (
      <span
        key={`${word}-${index}`}
        style={accented ? { color: accentColor } : undefined}
      >
        {index > 0 ? ' ' : ''}
        {word}
      </span>
    );
  });
}

function presetStyle(
  preset: KineticTypographyParams['preset'],
  style: StoryboardStyle,
): CSSProperties {
  switch (preset) {
    case 'counter':
      return {
        fontSize: 104,
        fontWeight: style.typography.headingWeight,
        letterSpacing: '-0.04em',
        color: `${style.palette.text}26`,
        WebkitTextStroke: `1.5px ${style.palette.accent}55`,
        textShadow: `0 0 60px ${style.palette.accent}33`,
      };
    case 'pill':
      return {
        fontSize: 54,
        fontWeight: 700,
        letterSpacing: '0.02em',
        color: pillTextColor(style),
        background: 'rgba(5, 10, 20, 0.66)',
        border: `2px solid ${style.palette.accent}66`,
        borderRadius: 28,
        padding: '20px 38px',
        boxShadow: `0 0 50px ${style.palette.accent}22`,
      };
    case 'statement':
      return {
        fontSize: 126,
        fontWeight: style.typography.headingWeight,
        letterSpacing: '-0.05em',
        color: `${style.palette.text}12`,
        WebkitTextStroke: `2.5px ${style.palette.accent}77`,
      };
  }
}

function pillTextColor(style: StoryboardStyle): string {
  return `${style.palette.text}dd`;
}

function alignmentStyles(
  align: KineticTypographyParams['align'],
): CSSProperties {
  switch (align) {
    case 'left':
      return {
        alignItems: 'flex-start',
        justifyContent: 'flex-start',
        textAlign: 'left',
      };
    case 'right':
      return {
        alignItems: 'flex-end',
        justifyContent: 'flex-start',
        textAlign: 'right',
      };
    case 'center':
      return {
        alignItems: 'center',
        justifyContent: 'flex-start',
        textAlign: 'center',
      };
  }
}

export function KineticTypography({
  scene,
  style,
  params,
}: KineticTypographyProps) {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const progress =
    durationInFrames <= 1 ? 0 : frame / (durationInFrames - 1);
  const [top, bottom] = backgroundColors(style);
  const zoom = interpolate(
    progress,
    [0, 1],
    [1, 1.03 + scene.camera.speed * 0.03],
  );
  const accents = accentWordSet(params.accentWords);
  const textStyle = presetStyle(params.preset, style);
  const accentColor =
    params.preset === 'pill'
      ? style.palette.accent
      : `${style.palette.accent}dd`;

  return (
    <AbsoluteFill
      style={{
        background: `linear-gradient(155deg, ${top} 0%, ${bottom} 58%, #05080f 100%)`,
      }}
    >
      <AbsoluteFill
        style={{
          backgroundImage: `linear-gradient(${style.palette.cold}0d 1px, transparent 1px), linear-gradient(90deg, ${style.palette.cold}0d 1px, transparent 1px)`,
          backgroundSize: '90px 90px',
          opacity: 0.7,
          transform: `scale(${zoom})`,
          transformOrigin: 'center',
        }}
      />
      <AbsoluteFill
        style={{
          background: `radial-gradient(circle at 50% 46%, ${style.palette.accent}30, transparent 34%), radial-gradient(circle at 18% 82%, ${style.palette.cold}1f, transparent 34%)`,
          transform: `scale(${zoom})`,
          transformOrigin: 'center',
        }}
      />

      <AbsoluteFill
        style={{
          ...alignmentStyles(params.align),
          top: params.preset === 'pill' ? '12%' : '20%',
          height: 'auto',
          padding: '0 56px',
          transform: `translateY(${interpolate(progress, [0, 1], [0, -1.6])}%)`,
          pointerEvents: 'none',
        }}
        data-preset={params.preset}
      >
        <div style={{ display: 'inline-block' }}>
          <div
            style={{
              ...textStyle,
              fontFamily: style.typography.heading,
              lineHeight: 1.02,
              textTransform: 'uppercase',
            }}
          >
            {renderWords(params.text, accents, accentColor)}
          </div>
          {params.underline ? (
            <div
              style={{
                height: 8,
                width: '100%',
                marginTop: 16,
                borderRadius: 6,
                background: `linear-gradient(90deg, ${style.palette.accent}, ${style.palette.cold})`,
                opacity: 0.85,
              }}
            />
          ) : null}
        </div>
      </AbsoluteFill>

      <AbsoluteFill
        style={{
          boxShadow: 'inset 0 0 300px 90px rgba(0,0,0,0.78)',
          pointerEvents: 'none',
        }}
      />
    </AbsoluteFill>
  );
}
