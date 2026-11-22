import { spring, useCurrentFrame, useVideoConfig } from 'remotion';
import {
  CANVAS,
  CONTENT_BOUNDS,
  CRITICAL_SAFE_BOUNDS,
  boundsWidth,
} from '../platform.js';
import { Card, Label, Pill } from '../primitives/index.js';
import type { PromptCardScene } from '../spec.js';
import type { UiTheme } from '../themes.js';
import { visualTimeline } from '../timeline.js';
import { reveal } from '../timing.js';

const CARD_TOP = 300;
/** The surface may pass under the rail; the text inside may not. */
const CARD_WIDTH = boundsWidth(CONTENT_BOUNDS);
const CARD_LEFT = CONTENT_BOUNDS.left;
const CARD_PADDING_LEFT = 60;
const BADGE_PADDING_LEFT = 22;
/** Text stops at the platform rail; the surface may pass under it. */
const CARD_TEXT_WIDTH =
  CRITICAL_SAFE_BOUNDS.right - CARD_LEFT - CARD_PADDING_LEFT - 8;
const CARD_IN_FRAME = 4;

function Mark({ kind, color }: { kind: 'star' | 'knot'; color: string }) {
  if (kind === 'knot') {
    return (
      <svg width={34} height={34} viewBox="0 0 24 24" aria-hidden>
        <circle
          cx="12"
          cy="12"
          r="9"
          fill="none"
          stroke={color}
          strokeWidth="2.2"
        />
        <circle
          cx="12"
          cy="12"
          r="4.4"
          fill="none"
          stroke={color}
          strokeWidth="2.2"
        />
      </svg>
    );
  }

  return (
    <svg width={34} height={34} viewBox="0 0 24 24" aria-hidden>
      <path
        d="M12 1.4c1.1 4.9 3.6 7.4 8.5 8.5-4.9 1.1-7.4 3.6-8.5 8.5-1.1-4.9-3.6-7.4-8.5-8.5 4.9-1.1 7.4-3.6 8.5-8.5Z"
        fill={color}
      />
    </svg>
  );
}

export function PromptCard({
  scene,
  theme,
}: {
  scene: PromptCardScene;
  theme: UiTheme;
}) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const timeline = visualTimeline(scene, fps);
  const push =
    timeline.durationInFrames <= 1
      ? 0
      : frame / (timeline.durationInFrames - 1);

  const badgeIn = Math.min(
    1,
    spring({ frame: frame - 1, fps, config: { damping: 200, mass: 0.7 } }),
  );
  const cardIn = Math.min(
    1,
    spring({
      frame: frame - CARD_IN_FRAME,
      fps,
      config: { damping: 16, mass: 0.7, stiffness: 140 },
    }),
  );
  const captionIn = reveal(
    frame,
    Math.round(timeline.durationInFrames * 0.55),
    6,
  );

  const tokens = scene.cardText.trim().split(/\s+/).filter(Boolean);

  return (
    <div
      data-ui-device={scene.device}
      data-ui-scene={scene.id}
      style={{ position: 'absolute', inset: 0 }}
    >
      <div
        data-ui-decoration="badge"
        style={{
          position: 'absolute',
          top: CARD_TOP,
          left: 0,
          width: CANVAS.width,
          display: 'flex',
          justifyContent: 'center',
          opacity: badgeIn,
          transform: `translateY(${(1 - badgeIn) * 18}px)`,
        }}
      >
        <Pill
          theme={theme}
          background={theme.surface}
          border={theme.border}
          radius={999}
          paddingX={40}
          paddingY={18}
          gap={18}
          shadow="soft"
          style={{ paddingLeft: BADGE_PADDING_LEFT }}
        >
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: 32,
              background: theme.ink,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Mark kind={scene.badge.mark} color={theme.accent} />
          </div>
          <Label
            theme={theme}
            token="caption"
            color={theme.surfaceInk}
            markers={{ critical: 'badge-label' }}
          >
            {scene.badge.label}
          </Label>
        </Pill>
      </div>

      <div
        style={{
          position: 'absolute',
          top: CARD_TOP + 104 + 84,
          left: CARD_LEFT,
          width: CARD_WIDTH,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
        }}
      >
        <Card
          theme={theme}
          background={theme.accent}
          radius={46}
          padding={58}
          shadow="strong"
          shadowColor={`${theme.accent}1f`}
          style={{
            width: CARD_WIDTH,
            padding: `58px 60px 58px ${CARD_PADDING_LEFT}px`,
            /* A vertical drift instead of a scale: scaling the surface grows the
               text past the platform rail and the linter rejects the scene. */
            transform: `translateY(${-3 * push}px) scale(${0.96 + 0.04 * cardIn})`,
            opacity: cardIn,
          }}
          markers={{ surface: 'card' }}
        >
          <Label
            theme={theme}
            token="card"
            color={theme.accentInk}
            style={{ width: CARD_TEXT_WIDTH }}
            markers={{ critical: 'card-text', within: 'card' }}
          >
            {tokens.map((token, index) => {
              const appear = reveal(
                frame,
                timeline.stepFrames[index] ?? timeline.revealFrame,
                3,
              );

              return (
                <span
                  key={`${token}-${index}`}
                  style={{
                    display: 'inline-block',
                    marginRight: '0.26em',
                    opacity: appear,
                    transform: `translateY(${(1 - appear) * 10}px)`,
                  }}
                >
                  {token}
                </span>
              );
            })}
          </Label>
        </Card>

        {scene.caption === null ? null : (
          <Label
            theme={theme}
            token="label"
            tone="muted"
            style={{ marginTop: 64, opacity: captionIn }}
            markers={{ critical: 'caption' }}
          >
            {scene.caption}
          </Label>
        )}
      </div>
    </div>
  );
}
