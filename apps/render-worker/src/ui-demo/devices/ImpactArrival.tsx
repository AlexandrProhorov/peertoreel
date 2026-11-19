import { spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { assetSrc } from '../asset-src.js';
import { CANVAS, CRITICAL_SAFE_BOUNDS } from '../platform.js';
import { Avatar, Card, Label } from '../primitives/index.js';
import type { ImpactArrivalScene } from '../spec.js';
import type { UiTheme } from '../themes.js';
import { visualTimeline } from '../timeline.js';
import { reveal } from '../timing.js';

const CARD_WIDTH = 800;
const CARD_LEFT =
  (CRITICAL_SAFE_BOUNDS.left + CRITICAL_SAFE_BOUNDS.right - CARD_WIDTH) / 2;
const CARD_TOP = 640;
const CARD_PADDING = 48;

/**
 * Mechanism: an object enters from outside the frame, lands, and transmits an
 * impulse to the rest of the composition (the index lights up, the edge jitters).
 * The content is configurable; the behaviour is the same for any message.
 */
export function ImpactArrival({
  scene,
  theme,
}: {
  scene: ImpactArrivalScene;
  theme: UiTheme;
}) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const timeline = visualTimeline(scene, fps);
  const impactAt = timeline.stepFrames[1] ?? Math.round(timeline.durationInFrames * 0.34);
  const indexAt = timeline.stepFrames[2] ?? impactAt + 3;

  const drop = spring({
    frame: frame - 2,
    fps,
    config: { damping: 13, mass: 1.1, stiffness: 90 },
  });
  const settled = frame >= impactAt;
  const decay = Math.max(0, frame - impactAt);
  const jitter = settled ? Math.sin(decay / 1.7) * 7 * Math.exp(-decay / 7) : 0;
  const indexIn = reveal(frame, indexAt, 4);
  const captionIn = reveal(frame, impactAt + 8, 6);

  return (
    <div
      data-ui-device={scene.device}
      data-ui-scene={scene.id}
      style={{ position: 'absolute', inset: 0 }}
    >
      <div
        style={{
          position: 'absolute',
          top: CARD_TOP,
          left: CARD_LEFT + jitter,
          width: CARD_WIDTH,
          transform: `translateY(${(1 - drop) * -960}px)`,
        }}
      >
        <Card
          theme={theme}
          background={theme.surface}
          radius={40}
          padding={CARD_PADDING}
          border={theme.border}
          shadow="strong"
          shadowColor="rgba(0, 0, 0, 0.45)"
          markers={{ surface: 'card' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
            <Label
              theme={theme}
              token="label"
              color={indexIn > 0.5 ? theme.accent : theme.muted}
              style={{
                letterSpacing: '0.12em',
                transform: `scale(${0.8 + 0.2 * indexIn})`,
                transformOrigin: 'left center',
              }}
              markers={{ critical: 'index-label', within: 'card' }}
            >
              {scene.index}
            </Label>

            <Label
              theme={theme}
              token="headline"
              tone="surface"
              style={{ flex: 1, textAlign: 'left' }}
              markers={{ critical: 'headline', within: 'card' }}
            >
              {scene.headline}
            </Label>

            {scene.object === null ? null : (
              <Avatar
                src={assetSrc(scene.object)}
                size={120}
                markers={{ decoration: 'impact-object' }}
              />
            )}
          </div>
        </Card>
      </div>

      {scene.caption === null ? null : (
        <Label
          theme={theme}
          token="body"
          tone="muted"
          align="center"
          style={{
            position: 'absolute',
            top: CARD_TOP + 360,
            left: CANVAS.width / 2 - (CRITICAL_SAFE_BOUNDS.right - CANVAS.width / 2),
            width: 2 * (CRITICAL_SAFE_BOUNDS.right - CANVAS.width / 2),
            opacity: captionIn,
          }}
          markers={{ critical: 'caption' }}
        >
          {scene.caption}
        </Label>
      )}
    </div>
  );
}
