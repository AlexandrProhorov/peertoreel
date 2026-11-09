import type {
  DerivedWord,
  SceneObject,
  StoryboardScene,
  StoryboardStyle,
} from '@peertoreel/contracts';
import {
  AbsoluteFill,
  interpolate,
  random,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import type { CSSProperties, ReactNode } from 'react';
import { objectAccentSec, objectWindowSec } from '../timing.js';

interface SceneObjectsProps {
  scene: StoryboardScene;
  style: StoryboardStyle;
  wordTimings?: readonly DerivedWord[];
}

function backgroundColors(style: StoryboardStyle): [string, string] {
  const background = style.palette.background;

  return [background[0] ?? '#0b1220', background[1] ?? background[0] ?? '#16233c'];
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function textColor(
  object: SceneObject,
  style: StoryboardStyle,
): string {
  if ((object.content ?? '').includes('°')) {
    return style.palette.cold;
  }

  if (object.animation === 'pop-in-danger') {
    return style.palette.danger;
  }

  if (
    object.animation === 'slide-up-pill' ||
    object.animation === 'pulse' ||
    object.animation === 'zoom-in-glow'
  ) {
    return style.palette.accent;
  }

  return style.palette.text;
}

function textLayout(object: SceneObject, style: StoryboardStyle): CSSProperties {
  const isPill = object.animation === 'slide-up-pill';
  const isPulse = object.animation === 'pulse';
  const isHuge =
    object.animation === 'zoom-in-glow' ||
    object.animation === 'count-up' ||
    object.animation === 'pop-in-danger';

  return {
    position: 'absolute',
    left: 56,
    right: 56,
    top: isPill ? '56%' : isPulse ? '66%' : '50%',
    transform: 'translateY(-50%)',
    display: 'flex',
    justifyContent: 'center',
    textAlign: 'center',
    fontFamily: style.typography.heading,
    fontWeight: isHuge ? style.typography.headingWeight : 700,
    fontSize: isHuge ? 154 : isPill ? 52 : 62,
    lineHeight: 1.02,
    letterSpacing: isHuge ? '-0.05em' : '0.01em',
    color: textColor(object, style),
    textShadow: isHuge
      ? `0 0 46px ${style.palette.accent}66, 0 8px 0 rgba(0,0,0,0.35)`
      : '0 4px 0 rgba(0,0,0,0.55)',
  };
}

function renderAccentedWords(content: string, style: StoryboardStyle): ReactNode {
  const words = content.split(/\s+/);

  if (words.length < 2) {
    return content;
  }

  const [first, ...rest] = words;

  if (!first || !/^\d/.test(first)) {
    return content;
  }

  return (
    <>
      <span style={{ color: style.palette.accent, marginRight: '0.08em' }}>
        {first}
      </span>
      {rest.join(' ')}
    </>
  );
}

function TextObject({
  object,
  style,
  progress,
  accentPulse,
}: {
  object: SceneObject;
  style: StoryboardStyle;
  progress: number;
  accentPulse: number;
}) {
  if (!object.content) {
    return null;
  }

  const isPill = object.animation === 'slide-up-pill';
  const scale = clamp(
    0.82 + progress * 0.18 + accentPulse * 0.04,
    0.8,
    1.12,
  );
  const layout = textLayout(object, style);
  const content = isPill ? (
    <span
      style={{
        background: 'rgba(5, 10, 20, 0.74)',
        border: `1px solid ${style.palette.accent}44`,
        borderRadius: 18,
        padding: '16px 30px',
        textTransform: 'uppercase',
        fontSize: 46,
      }}
    >
      {renderAccentedWords(object.content, style)}
    </span>
  ) : (
    renderAccentedWords(object.content, style)
  );

  return (
    <div
      style={{
        ...layout,
        opacity: progress,
        transform: `${layout.transform ?? ''} scale(${scale})`,
      }}
    >
      {content}
    </div>
  );
}

function Snow({ seconds, style }: { seconds: number; style: StoryboardStyle }) {
  const flakes = Array.from({ length: 54 }, (_, index) => {
    const left = random(`snow-x-${index}`) * 100;
    const size = 2 + random(`snow-size-${index}`) * 5;
    const speed = 0.04 + random(`snow-speed-${index}`) * 0.09;
    const offset = random(`snow-offset-${index}`);
    const top = ((offset + seconds * speed) % 1) * 112 - 6;

    return (
      <span
        key={index}
        style={{
          position: 'absolute',
          left: `${left}%`,
          top: `${top}%`,
          width: size,
          height: size,
          borderRadius: '50%',
          background: style.palette.text,
          opacity: 0.35 + random(`snow-opacity-${index}`) * 0.5,
          filter: 'blur(0.3px)',
        }}
      />
    );
  });

  return <AbsoluteFill style={{ pointerEvents: 'none' }}>{flakes}</AbsoluteFill>;
}

function Steam({ seconds, style }: { seconds: number; style: StoryboardStyle }) {
  const puffs = Array.from({ length: 16 }, (_, index) => {
    const left = 24 + random(`steam-x-${index}`) * 52;
    const speed = 0.12 + random(`steam-speed-${index}`) * 0.12;
    const offset = random(`steam-offset-${index}`);
    const rise = (offset + seconds * speed) % 1;
    const top = 78 - rise * 54;
    const size = 20 + random(`steam-size-${index}`) * 46;

    return (
      <span
        key={index}
        style={{
          position: 'absolute',
          left: `${left}%`,
          top: `${top}%`,
          width: size,
          height: size,
          borderRadius: '50%',
          background: style.palette.text,
          opacity: (1 - rise) * 0.22,
          filter: 'blur(12px)',
        }}
      />
    );
  });

  return <AbsoluteFill style={{ pointerEvents: 'none' }}>{puffs}</AbsoluteFill>;
}

function LampCone({
  seconds,
  style,
}: {
  seconds: number;
  style: StoryboardStyle;
}) {
  const pulse = 0.82 + Math.sin(seconds * 1.7) * 0.08;

  return (
    <div
      style={{
        position: 'absolute',
        top: -40,
        right: -20,
        width: 560,
        height: 1200,
        background: `linear-gradient(to bottom, ${style.palette.accent}55, ${style.palette.accent}00)`,
        clipPath: 'polygon(45% 0, 58% 0, 100% 100%, 0% 100%)',
        filter: 'blur(18px)',
        opacity: pulse,
        pointerEvents: 'none',
      }}
    />
  );
}

function HeadlightCone({
  seconds,
  style,
}: {
  seconds: number;
  style: StoryboardStyle;
}) {
  const flicker = 0.55 + Math.sin(seconds * 9) * 0.04;
  const beam = (left: number, angle: number) => (
    <div
      key={left}
      style={{
        position: 'absolute',
        left: `${left}%`,
        bottom: '30%',
        width: 64,
        height: 380,
        transformOrigin: 'top center',
        transform: `rotate(${angle}deg)`,
        background: `linear-gradient(to bottom, ${style.palette.accent}bb, ${style.palette.accent}00)`,
        clipPath: 'polygon(42% 0, 58% 0, 100% 100%, 0% 100%)',
        filter: 'blur(9px)',
        opacity: flicker,
        pointerEvents: 'none',
      }}
    />
  );

  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      {beam(72, 12)}
      {beam(77, 18)}
    </AbsoluteFill>
  );
}

function Frost({
  progress,
  style,
}: {
  progress: number;
  style: StoryboardStyle;
}) {
  return (
    <AbsoluteFill
      style={{
        pointerEvents: 'none',
        opacity: progress * 0.7,
        background: `radial-gradient(circle at 0% 0%, ${style.palette.cold}66, transparent 32%), radial-gradient(circle at 100% 0%, ${style.palette.cold}44, transparent 28%), radial-gradient(circle at 50% 100%, ${style.palette.cold}33, transparent 40%)`,
      }}
    />
  );
}

function CarSilhouette({ style }: { style: StoryboardStyle }) {
  const [, second] = backgroundColors(style);

  return (
    <svg
      viewBox="0 0 640 260"
      width="88%"
      style={{ filter: 'drop-shadow(0 24px 30px rgba(0,0,0,0.55))' }}
      aria-hidden="true"
    >
      <path
        d="M60 196 L92 142 Q110 116 150 112 L240 104 L306 70 Q330 58 366 62 L448 78 Q500 88 532 124 L578 142 Q606 150 612 178 L612 196 Z"
        fill={second}
        stroke={style.palette.cold}
        strokeOpacity={0.22}
        strokeWidth={3}
      />
      <path
        d="M258 108 L312 80 Q330 70 356 74 L420 86 Q456 94 478 116 Z"
        fill={style.palette.cold}
        fillOpacity={0.22}
      />
      <rect x="72" y="174" width="530" height="16" rx="8" fill="#000" opacity="0.35" />
      <circle cx="170" cy="198" r="34" fill="#070b12" stroke={style.palette.cold} strokeOpacity={0.25} strokeWidth={6} />
      <circle cx="500" cy="198" r="34" fill="#070b12" stroke={style.palette.cold} strokeOpacity={0.25} strokeWidth={6} />
      <circle cx="170" cy="198" r="12" fill={style.palette.cold} opacity={0.35} />
      <circle cx="500" cy="198" r="12" fill={style.palette.cold} opacity={0.35} />
      <rect x="584" y="154" width="18" height="14" rx="6" fill={style.palette.accent} />
      <circle cx="596" cy="161" r="28" fill={style.palette.accent} opacity="0.18" />
    </svg>
  );
}

function CharacterObject({
  object,
  seconds,
  style,
}: {
  object: SceneObject;
  seconds: number;
  style: StoryboardStyle;
}) {
  if (object.content !== 'car') {
    return null;
  }

  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: '13%',
        display: 'flex',
        justifyContent: 'center',
        transform: `translateY(${Math.sin(seconds * 2.1) * 2}px)`,
      }}
    >
      <CarSilhouette style={style} />
    </div>
  );
}

function BatteryGauge({
  object,
  animationProgress,
  style,
}: {
  object: SceneObject;
  animationProgress: number;
  style: StoryboardStyle;
}) {
  if (object.content !== 'battery-gauge') {
    return null;
  }

  const charge = interpolate(animationProgress, [0, 1], [100, 60], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <div
      style={{
        position: 'absolute',
        left: 150,
        right: 150,
        top: '36%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 22,
      }}
    >
      <div
        style={{
          width: '100%',
          height: 190,
          border: `8px solid ${style.palette.text}cc`,
          borderRadius: 26,
          padding: 16,
          boxSizing: 'border-box',
          position: 'relative',
        }}
      >
        <div
          style={{
            height: '100%',
            width: `${charge}%`,
            borderRadius: 12,
            background: `linear-gradient(90deg, ${style.palette.accent}, ${style.palette.cold})`,
            transition: 'none',
          }}
        />
        <div
          style={{
            position: 'absolute',
            right: -28,
            top: '50%',
            transform: 'translateY(-50%)',
            width: 20,
            height: 70,
            borderRadius: 6,
            background: style.palette.text,
          }}
        />
      </div>
    </div>
  );
}

function ObjectVisual({
  object,
  style,
  seconds,
  progress,
  animationProgress,
  accentPulse,
}: {
  object: SceneObject;
  style: StoryboardStyle;
  seconds: number;
  progress: number;
  animationProgress: number;
  accentPulse: number;
}) {
  switch (object.kind) {
    case 'text':
      return (
        <TextObject
          object={object}
          style={style}
          progress={progress}
          accentPulse={accentPulse}
        />
      );
    case 'particles':
      return object.content?.includes('steam') ? (
        <Steam seconds={seconds} style={style} />
      ) : (
        <Snow seconds={seconds} style={style} />
      );
    case 'light':
      return object.content?.includes('headlight') ? (
        <HeadlightCone seconds={seconds} style={style} />
      ) : (
        <LampCone seconds={seconds} style={style} />
      );
    case 'overlay':
      return <Frost progress={progress} style={style} />;
    case 'character':
      return <CharacterObject object={object} seconds={seconds} style={style} />;
    case 'chart':
      return (
        <BatteryGauge
          object={object}
          animationProgress={animationProgress}
          style={style}
        />
      );
    case 'image':
    case 'shape':
      return null;
    default:
      return null;
  }
}

export function SceneObjects({
  scene,
  style,
  wordTimings,
}: SceneObjectsProps) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const seconds = frame / fps;

  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      {scene.objects.map((object) => {
        const window = objectWindowSec(scene, object, wordTimings);
        const accentSec = objectAccentSec(scene, object, wordTimings);

        if (window.endSec <= window.startSec) {
          return null;
        }

        const visibleFrom = Math.max(0, window.startSec - 0.18);

        if (seconds < visibleFrom || seconds > window.endSec) {
          return null;
        }

        const appear = interpolate(
          seconds,
          [visibleFrom, Math.min(visibleFrom + 0.35, window.endSec)],
          [0, 1],
          { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
        );
        const disappear = interpolate(
          seconds,
          [Math.max(window.endSec - 0.25, window.startSec), window.endSec],
          [1, 0],
          { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
        );
        const animationProgress = clamp(
          (seconds - window.startSec) /
            Math.max(0.001, window.endSec - window.startSec),
          0,
          1,
        );
        const accentPulse =
          accentSec === null
            ? 0
            : interpolate(
                seconds,
                [accentSec - 0.12, accentSec, accentSec + 0.35],
                [0, 1, 0],
                { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
              );

        return (
          <ObjectVisual
            key={object.id}
            object={object}
            style={style}
            seconds={seconds}
            progress={Math.min(appear, disappear)}
            animationProgress={animationProgress}
            accentPulse={accentPulse}
          />
        );
      })}
    </AbsoluteFill>
  );
}
