import { Img, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { assetSrc } from '../asset-src.js';
import {
  CANVAS,
  CONTENT_BOUNDS,
  CRITICAL_SAFE_BOUNDS,
} from '../platform.js';
import type { SocialProofScene } from '../spec.js';
import type { UiTheme } from '../themes.js';
import { visualTimeline } from '../timeline.js';
import { reveal } from '../timing.js';
import { textStyle } from '../typography.js';

const TITLE_TOP = 330;
const CARD_TOP = 800;
const CARD_WIDTH = 900;
const CARD_LEFT = (CANVAS.width - CARD_WIDTH) / 2;
const CARD_PADDING = 36;
const AVATAR = 76;
/** Text inside the card stops at the critical edge; the card surface may not. */
const TEXT_WIDTH =
  CRITICAL_SAFE_BOUNDS.right -
  (CARD_LEFT + CARD_PADDING + AVATAR + 24) -
  8;

export function SocialProof({
  scene,
  theme,
}: {
  scene: SocialProofScene;
  theme: UiTheme;
}) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const timeline = visualTimeline(scene, fps);
  const titleIn = reveal(frame, timeline.titleFrame, 6);
  const cardStarts = timeline.stepFrames;

  return (
    <div
      data-ui-device={scene.device}
      data-ui-scene={scene.id}
      style={{ position: 'absolute', inset: 0 }}
    >
      <div
        style={{
          position: 'absolute',
          top: TITLE_TOP,
          left: CONTENT_BOUNDS.left,
          width: CRITICAL_SAFE_BOUNDS.right - CONTENT_BOUNDS.left,
          display: 'flex',
          justifyContent: 'center',
          opacity: titleIn,
          transform: `translateY(${(1 - titleIn) * 12}px)`,
        }}
      >
        <div data-ui-critical="title" style={textStyle('headline', theme.ink)}>
          {scene.title}
        </div>
      </div>

      {scene.cards.map((card, index) => {
        const start = cardStarts[index] ?? 0;
        const nextStart = cardStarts[index + 1];
        const visibleUntil =
          nextStart === undefined ? timeline.durationInFrames : nextStart;
        const visible = frame >= start && frame < visibleUntil;

        /* Only the active card is mounted: two cards in the DOM overlap by
           design and the linter would (correctly) flag the collision. */
        if (!visible) {
          return null;
        }

        const pop = Math.min(
          1,
          spring({
            frame: frame - start,
            fps,
            config: { damping: 13, mass: 0.6, stiffness: 150 },
          }),
        );
        const settle = Math.min(
          1,
          spring({
            frame: frame - start,
            fps,
            config: { damping: 200, mass: 0.9 },
          }),
        );

        return (
          <div
            key={`${card.name}-${index}`}
            style={{
              position: 'absolute',
              top: CARD_TOP,
              left: CARD_LEFT,
              width: CARD_WIDTH,
              opacity: pop,
              transform: `translateY(${(1 - pop) * 60}px) rotate(${
                (1 - settle) * -3.2
              }deg) scale(${0.94 + 0.06 * pop})`,
              transformOrigin: 'center bottom',
            }}
          >
            <div
              data-ui-surface={`proof-${index}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 24,
                padding: CARD_PADDING,
                borderRadius: 40,
                background: theme.surface,
                border: `2px solid ${theme.border}`,
                boxShadow: '0 24px 70px rgba(0, 0, 0, 0.28)',
              }}
            >
              <Img
                src={assetSrc(card.avatar)}
                data-ui-decoration="proof-avatar"
                style={{
                  width: AVATAR,
                  height: AVATAR,
                  borderRadius: AVATAR / 2,
                  objectFit: 'contain',
                  background: theme.background,
                  flexShrink: 0,
                }}
              />
              <div
                style={{
                  width: TEXT_WIDTH,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                }}
              >
                <div
                  data-ui-critical="proof-name"
                  style={textStyle('name', theme.muted)}
                >
                  {card.name}
                </div>
                <div
                  data-ui-critical="proof-text"
                  style={textStyle('body', theme.surfaceInk)}
                >
                  {card.text}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
