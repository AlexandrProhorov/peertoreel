import { Img, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { assetSrc } from '../asset-src.js';
import { CANVAS, CRITICAL_SAFE_BOUNDS } from '../platform.js';
import type { ObjectRevealScene } from '../spec.js';
import { OBJECT_TONES } from '../themes.js';
import { visualTimeline } from '../timeline.js';
import { reveal } from '../timing.js';
import { textStyle } from '../typography.js';

const OBJECT_TOP = 430;
const OBJECT_SIZE = 600;
const CAPTION_TOP = 1240;
const CAPTION_MAX_WIDTH =
  2 * (CRITICAL_SAFE_BOUNDS.right - CANVAS.width / 2) - 8;

export function ObjectReveal({ scene }: { scene: ObjectRevealScene }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const timeline = visualTimeline(scene, fps);
  const tone = OBJECT_TONES[scene.tone];
  const objectIn = Math.min(
    1,
    spring({ frame: frame - 2, fps, config: { damping: 15, mass: 0.8 } }),
  );
  const breathe = Math.sin(frame / 28) * 6;
  const captionIn = reveal(frame, timeline.revealFrame + 6, 6);
  const tokens = scene.caption.trim().split(/\s+/).filter(Boolean);

  return (
    <div
      data-ui-device={scene.device}
      data-ui-scene={scene.id}
      style={{
        position: 'absolute',
        inset: 0,
        background: `linear-gradient(160deg, ${tone.from} 0%, ${tone.to} 100%)`,
      }}
    >
      <div
        data-ui-surface="stage"
        style={{
          position: 'absolute',
          inset: 0,
          background: `radial-gradient(circle at 50% 42%, rgba(255,255,255,0.18), transparent 55%)`,
        }}
      />

      <Img
        src={assetSrc(scene.object)}
        data-ui-decoration="reveal-object"
        style={{
          position: 'absolute',
          top: OBJECT_TOP,
          left: CANVAS.width / 2 - OBJECT_SIZE / 2,
          width: OBJECT_SIZE,
          height: OBJECT_SIZE,
          objectFit: 'contain',
          opacity: objectIn,
          transform: `rotate(${scene.tiltDeg}deg) translateY(${
            breathe + (1 - objectIn) * 40
          }px) scale(${0.88 + 0.12 * objectIn})`,
        }}
      />

      <div
        style={{
          position: 'absolute',
          top: CAPTION_TOP,
          left: CANVAS.width / 2 - CAPTION_MAX_WIDTH / 2,
          width: CAPTION_MAX_WIDTH,
          display: 'flex',
          justifyContent: 'center',
          textAlign: 'center',
        }}
      >
        <div
          data-ui-critical="caption"
          style={{ ...textStyle('headline', tone.ink), opacity: captionIn }}
        >
          {tokens.map((token, index) => {
            const appear = reveal(
              frame,
              (timeline.stepFrames[index] ?? timeline.revealFrame) + 6,
              4,
            );

            return (
              <span
                key={`${token}-${index}`}
                style={{
                  display: 'inline-block',
                  marginRight: '0.24em',
                  opacity: appear,
                  transform: `translateY(${(1 - appear) * 14}px)`,
                }}
              >
                {token}
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
}

