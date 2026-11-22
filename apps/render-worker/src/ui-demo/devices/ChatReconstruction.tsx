import { Img, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { assetSrc } from '../asset-src.js';
import {
  CONTENT_BOUNDS,
  CRITICAL_SAFE_BOUNDS,
} from '../platform.js';
import type { ChatReconstructionScene } from '../spec.js';
import type { UiTheme } from '../themes.js';
import { visualTimeline } from '../timeline.js';
import { reveal } from '../timing.js';
import { textStyle } from '../typography.js';

const TITLE_TOP = 300;
const SLOT_HEIGHT = 200;
const AVATAR_SIZE = 96;
const BUBBLE_MAX_WIDTH = 660;
const SKELETON_LEAD_FRAMES = 12;

/** Messages are right-aligned to the critical edge, not to the frame edge. */
const COLUMN_LEFT = CONTENT_BOUNDS.left;
const COLUMN_WIDTH = CRITICAL_SAFE_BOUNDS.right - COLUMN_LEFT;

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export function ChatReconstruction({
  scene,
  theme,
}: {
  scene: ChatReconstructionScene;
  theme: UiTheme;
}) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const timeline = visualTimeline(scene, fps);
  const titleIn = reveal(frame, timeline.titleFrame, 6);
  const pulse = interpolate(frame % 24, [0, 12, 24], [0.55, 1, 0.55]);
  const avatar = assetSrc(scene.avatar);

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
          left: COLUMN_LEFT,
          width: COLUMN_WIDTH,
          display: 'flex',
          justifyContent: 'center',
          opacity: titleIn,
        }}
      >
        <div data-ui-critical="title" style={textStyle('headline', theme.ink)}>
          {scene.title}
        </div>
      </div>

      <div
        style={{
          position: 'absolute',
          top: TITLE_TOP + 110,
          left: COLUMN_LEFT,
          width: COLUMN_WIDTH,
          height: SLOT_HEIGHT * scene.messages.length,
        }}
      >
        {scene.messages.map((message, index) => {
          const appearFrame = timeline.stepFrames[index] ?? 0;
          const showSkeleton =
            frame < appearFrame && frame >= appearFrame - SKELETON_LEAD_FRAMES;
          const pop = clamp01(
            spring({
              frame: frame - appearFrame,
              fps,
              config: { damping: 15, mass: 0.55, stiffness: 170 },
            }),
          );
          const shown = frame >= appearFrame;

          return (
            <div
              key={`${message.text}-${index}`}
              style={{
                position: 'absolute',
                top: index * SLOT_HEIGHT,
                left: 0,
                width: '100%',
                display: 'flex',
                justifyContent: 'flex-end',
                alignItems: 'flex-start',
              }}
            >
              <div
                data-ui-decoration="skeleton"
                style={{
                  position: 'absolute',
                  right: 0,
                  top: 0,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 22,
                  opacity: showSkeleton ? pulse : 0,
                }}
              >
                <div
                  style={{
                    width: 620,
                    height: 118,
                    borderRadius: 38,
                    background: theme.skeleton,
                  }}
                />
                <div
                  style={{
                    width: AVATAR_SIZE,
                    height: AVATAR_SIZE,
                    borderRadius: AVATAR_SIZE / 2,
                    background: theme.skeleton,
                  }}
                />
              </div>

              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 22,
                  opacity: shown ? pop : 0,
                  transform: `scale(${shown ? 0.92 + 0.08 * pop : 0.92})`,
                  transformOrigin: 'right center',
                }}
              >
                <div
                  data-ui-critical="message"
                  style={{
                    width: 'fit-content',
                    maxWidth: BUBBLE_MAX_WIDTH,
                    background: theme.accent,
                    color: theme.accentInk,
                    padding: '26px 34px',
                    borderRadius: 40,
                    ...textStyle('bubble'),
                  }}
                >
                  {message.text}
                </div>
                <Img
                  src={avatar}
                  data-ui-decoration="avatar"
                  style={{
                    width: AVATAR_SIZE,
                    height: AVATAR_SIZE,
                    borderRadius: AVATAR_SIZE / 2,
                    objectFit: 'contain',
                    background: theme.surface,
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
