import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import { CANVAS } from '../platform.js';
import { themeById } from '../themes.js';
import { FONT_FAMILY, textStyle } from '../typography.js';
import {
  bobOffset,
  counterValue,
  popScale,
  settleTilt,
  sweepProgress,
  typeOnFrames,
} from './interactions.js';

export type UiMicroProps = {
  readonly durationSec: number;
};

export const UI_MICRO_DEFAULT_PROPS: UiMicroProps = { durationSec: 4 };

const TILE_WIDTH = 470;
const TILE_HEIGHT = 520;
const GAP = 40;

function Tile({
  title,
  children,
  index,
}: {
  title: string;
  children: React.ReactNode;
  index: number;
}) {
  const column = index % 2;
  const row = Math.floor(index / 2);
  const theme = themeById('studio-dark');

  return (
    <div
      style={{
        position: 'absolute',
        left: 60 + column * (TILE_WIDTH + GAP),
        top: 120 + row * (TILE_HEIGHT + GAP + 40),
        width: TILE_WIDTH,
        height: TILE_HEIGHT,
        borderRadius: 32,
        background: theme.surface,
        border: `2px solid ${theme.border}`,
        overflow: 'hidden',
        fontFamily: FONT_FAMILY,
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: 18,
          left: 0,
          width: '100%',
          textAlign: 'center',
          ...textStyle('label', theme.muted),
          fontSize: 26,
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
        }}
      >
        {title}
      </div>
      <div style={{ position: 'absolute', inset: '70px 24px 24px' }}>
        {children}
      </div>
    </div>
  );
}

export function UiMicro(_props: UiMicroProps) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const theme = themeById('studio-dark');
  const pop = popScale(frame, 10, fps);
  const tilt = settleTilt(frame, 12, fps, -4);
  const words = ['текст', 'идёт', 'в', 'ритме', 'кадра'];
  const typeFrames = typeOnFrames(words.length, 6, 60);
  const value = counterValue(frame, 10, 80, 0, 107600);
  const sweep = sweepProgress(frame, 20, 40);
  const notification = popScale(frame, 30, fps);
  const bob = bobOffset(frame, 52, 10);

  return (
    <AbsoluteFill
      style={{ width: CANVAS.width, height: CANVAS.height, backgroundColor: theme.background }}
    >
      <Tile title="pop" index={0}>
        <div
          style={{
            width: 180,
            height: 180,
            borderRadius: 90,
            background: theme.accent,
            margin: '120px auto 0',
            transform: `scale(${pop})`,
          }}
        />
      </Tile>

      <Tile title="settle tilt" index={1}>
        <div
          style={{
            width: 320,
            height: 220,
            borderRadius: 28,
            background: theme.accent,
            margin: '100px auto 0',
            transform: `rotate(${tilt}deg) translateY(${12 - tilt * 2}px)`,
            boxShadow: '0 20px 60px rgba(0,0,0,0.35)',
          }}
        />
      </Tile>

      <Tile title="type-on" index={2}>
        <div style={{ marginTop: 140, textAlign: 'center' }}>
          {words.map((word, index) => {
            const start = typeFrames[index] ?? 0;
            const appear = Math.min(1, Math.max(0, (frame - start) / 3));

            return (
              <span
                key={`${word}-${index}`}
                style={{
                  display: 'inline-block',
                  marginRight: '0.24em',
                  ...textStyle('body', theme.ink),
                  fontSize: 44,
                  opacity: appear,
                  transform: `translateY(${(1 - appear) * 10}px)`,
                }}
              >
                {word}
              </span>
            );
          })}
        </div>
      </Tile>

      <Tile title="counter" index={3}>
        <div
          style={{
            marginTop: 130,
            textAlign: 'center',
            ...textStyle('display', theme.accent),
            fontSize: 84,
          }}
        >
          {Math.round(value / 1000)}K
        </div>
      </Tile>

      <Tile title="notification" index={4}>
        <div
          style={{
            marginTop: 120,
            padding: '24px 28px',
            borderRadius: 26,
            background: theme.accent,
            color: theme.accentInk,
            fontFamily: FONT_FAMILY,
            fontSize: 34,
            fontWeight: 700,
            opacity: notification,
            transform: `translateY(${(1 - notification) * 120}px) scale(${
              0.9 + 0.1 * notification
            })`,
          }}
        >
          новое сообщение
        </div>
      </Tile>

      <Tile title="sweep / bob" index={5}>
        <div style={{ marginTop: 110, position: 'relative', textAlign: 'center' }}>
          <div
            style={{
              position: 'absolute',
              inset: 0,
              borderRadius: 10,
              background: theme.accent,
              clipPath: `inset(0 ${(1 - sweep) * 100}% 0 0)`,
            }}
          />
          <div
            style={{
              position: 'relative',
              ...textStyle('selection', theme.ink),
              padding: '6px 14px',
            }}
          >
            выделение
          </div>
        </div>
        <div
          style={{
            width: 120,
            height: 120,
            borderRadius: 60,
            background: theme.accent,
            margin: '40px auto 0',
            transform: `translateY(${bob}px)`,
          }}
        />
      </Tile>
    </AbsoluteFill>
  );
}
