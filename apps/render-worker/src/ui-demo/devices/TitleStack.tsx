import { Img, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { assetSrc } from '../asset-src.js';
import {
  CANVAS,
  CONTENT_BOUNDS,
  CRITICAL_SAFE_BOUNDS,
} from '../platform.js';
import type { TitleStackScene } from '../spec.js';
import type { UiTheme } from '../themes.js';
import { visualTimeline } from '../timeline.js';
import { reveal } from '../timing.js';
import { textStyle } from '../typography.js';

const BLOCK_TOPS = { upper: 420, middle: 820, lower: 1180 } as const;
/** Centred layouts are capped by the distance to the critical edge (minus a safety gap). */
const CENTRED_MAX_WIDTH =
  2 * (CRITICAL_SAFE_BOUNDS.right - CANVAS.width / 2) - 8;
const ICON_SIZE = 150;
const ORBIT_RADIUS = 330;

function normalize(word: string): string {
  return word.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
}

export function TitleStack({
  scene,
  theme,
}: {
  scene: TitleStackScene;
  theme: UiTheme;
}) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const timeline = visualTimeline(scene, fps);
  const tokens = scene.title.trim().split(/\s+/).filter(Boolean);
  const highlights = new Set(scene.highlightWords.map(normalize));
  const titleToken = tokens.length <= 3 ? 'display' : 'headline';
  const iconsInRow = scene.icons.length > 0 && scene.icons.length < 3;
  const titleIn = reveal(frame, timeline.titleFrame, 5);
  const subtitleIn = reveal(
    frame,
    timeline.titleFrame + Math.round(timeline.revealWindowFrames * 0.6),
    6,
  );
  const isLeft = scene.align === 'left';
  const blockWidth = isLeft
    ? CRITICAL_SAFE_BOUNDS.right - CONTENT_BOUNDS.left
    : CENTRED_MAX_WIDTH;
  const blockLeft = isLeft
    ? CONTENT_BOUNDS.left
    : CANVAS.width / 2 - blockWidth / 2;

  return (
    <div
      data-ui-device={scene.device}
      data-ui-scene={scene.id}
      style={{ position: 'absolute', inset: 0 }}
    >
      <div
        style={{
          position: 'absolute',
          top: BLOCK_TOPS[scene.vertical],
          left: blockLeft,
          width: blockWidth,
          display: 'flex',
          flexDirection: 'column',
          alignItems: isLeft ? 'flex-start' : 'center',
          textAlign: isLeft ? 'left' : 'center',
          gap: 28,
        }}
      >
        {scene.eyebrow === null ? null : (
          <div
            data-ui-critical="eyebrow"
            style={{
              ...textStyle('label', theme.muted),
              textTransform: 'uppercase',
              opacity: reveal(frame, timeline.titleFrame - 2, 5),
            }}
          >
            {scene.eyebrow}
          </div>
        )}

        <div
          data-ui-critical="title"
          style={{ ...textStyle(titleToken, theme.ink), opacity: titleIn }}
        >
          {tokens.map((token, index) => {
            const appear = reveal(
              frame,
              timeline.stepFrames[index] ?? timeline.revealFrame,
              4,
            );
            const accented = highlights.has(normalize(token));

            return (
              <span
                key={`${token}-${index}`}
                style={{
                  display: 'inline-block',
                  marginRight: '0.24em',
                  opacity: appear,
                  color: accented ? theme.accent : undefined,
                  transform: `translateY(${(1 - appear) * 12}px)`,
                }}
              >
                {token}
              </span>
            );
          })}
        </div>

        {scene.subtitle === null ? null : (
          <div
            data-ui-critical="subtitle"
            style={{
              ...textStyle('body', theme.muted),
              opacity: subtitleIn,
              transform: `translateY(${(1 - subtitleIn) * 10}px)`,
            }}
          >
            {scene.subtitle}
          </div>
        )}

        {iconsInRow ? (
          <div
            data-ui-decoration="icon-row"
            style={{
              display: 'flex',
              justifyContent: isLeft ? 'flex-start' : 'center',
              gap: 32,
              marginTop: 36,
            }}
          >
            {scene.icons.map((icon, index) => (
              <Icon
                key={`${icon.key}-${index}`}
                src={assetSrc(icon)}
                index={index}
                frame={frame}
                fps={fps}
                size={ICON_SIZE + 28}
              />
            ))}
          </div>
        ) : null}
      </div>

      {scene.icons.length === 0 || iconsInRow ? null : (
        <div
          data-ui-decoration="orbit"
          style={{
            position: 'absolute',
            top: BLOCK_TOPS[scene.vertical] + 470,
            left: CANVAS.width / 2 - ORBIT_RADIUS - ICON_SIZE / 2,
            width: (ORBIT_RADIUS + ICON_SIZE / 2) * 2,
            height: (ORBIT_RADIUS + ICON_SIZE / 2) * 2,
          }}
        >
          {scene.centerMark ? (
            <div
              style={{
                position: 'absolute',
                left: '50%',
                top: '50%',
                width: 380,
                height: 380,
                marginLeft: -190,
                marginTop: -190,
                borderRadius: 190,
                background: theme.surface,
                border: `2px solid ${theme.border}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 30px 80px rgba(0, 0, 0, 0.18)',
              }}
            >
              <svg width={130} height={130} viewBox="0 0 24 24" aria-hidden>
                <circle
                  cx="12"
                  cy="12"
                  r="9"
                  fill="none"
                  stroke={theme.ink}
                  strokeWidth="2.2"
                />
                <circle
                  cx="12"
                  cy="12"
                  r="4.4"
                  fill="none"
                  stroke={theme.ink}
                  strokeWidth="2.2"
                />
              </svg>
            </div>
          ) : null}

          {scene.icons.map((icon, index) => {
            const angle =
              -Math.PI / 2 + (index / scene.icons.length) * Math.PI * 2;
            const x = ORBIT_RADIUS + ICON_SIZE / 2 + Math.cos(angle) * ORBIT_RADIUS;
            const y = ORBIT_RADIUS + ICON_SIZE / 2 + Math.sin(angle) * ORBIT_RADIUS;

            return (
              <div
                key={`${icon.key}-${index}`}
                style={{
                  position: 'absolute',
                  left: x - ICON_SIZE / 2,
                  top: y - ICON_SIZE / 2,
                }}
              >
                <Icon
                  src={assetSrc(icon)}
                  index={index}
                  frame={frame}
                  fps={fps}
                  size={ICON_SIZE}
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Icon({
  src,
  index,
  frame,
  fps,
  size,
}: {
  src: string;
  index: number;
  frame: number;
  fps: number;
  size: number;
}) {
  const pop = Math.min(
    1,
    spring({
      frame: frame - 6 - index * 3,
      fps,
      config: { damping: 14, mass: 0.6, stiffness: 160 },
    }),
  );
  const bob = Math.sin((frame + index * 11) / 26) * 5;

  return (
    <Img
      src={src}
      style={{
        width: size,
        height: size,
        objectFit: 'contain',
        opacity: pop,
        transform: `translateY(${bob + (1 - pop) * 26}px) scale(${0.7 + 0.3 * pop})`,
      }}
    />
  );
}
