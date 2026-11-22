import { Img, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { assetSrc } from '../asset-src.js';
import {
  CANVAS,
  CRITICAL_SAFE_BOUNDS,
} from '../platform.js';
import type { PredictionInputScene } from '../spec.js';
import type { UiTheme } from '../themes.js';
import { visualTimeline } from '../timeline.js';
import { reveal } from '../timing.js';
import { textStyle } from '../typography.js';

const OBJECT_TOP = 380;
const OBJECT_SIZE = 360;
const PILL_TOP = 1130;
const PILL_WIDTH = 800;
/** The whole pill (text + send affordance) stays inside the critical bounds. */
const PILL_LEFT = (CRITICAL_SAFE_BOUNDS.left + CRITICAL_SAFE_BOUNDS.right - PILL_WIDTH) / 2;
const PILL_PADDING = 40;
const ANSWER_TOP = 1270;
const ANSWER_MAX_WIDTH =
  2 * (CRITICAL_SAFE_BOUNDS.right - CANVAS.width / 2) - 8;

export function PredictionInput({
  scene,
  theme,
}: {
  scene: PredictionInputScene;
  theme: UiTheme;
}) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const timeline = visualTimeline(scene, fps);
  const answerAt = timeline.stepFrames[1] ?? Math.round(timeline.durationInFrames * 0.55);
  const promptOut = reveal(frame, answerAt - 8, 6);
  const objectIn = Math.min(
    1,
    spring({ frame: frame - 2, fps, config: { damping: 16, mass: 0.8 } }),
  );
  const bob = Math.sin(frame / 22) * 8;
  const answerTokens = scene.answer.trim().split(/\s+/).filter(Boolean);

  return (
    <div
      data-ui-device={scene.device}
      data-ui-scene={scene.id}
      style={{ position: 'absolute', inset: 0 }}
    >
      <Img
        src={assetSrc(scene.object)}
        data-ui-decoration="prediction-object"
        style={{
          position: 'absolute',
          top: OBJECT_TOP,
          left: CANVAS.width / 2 - OBJECT_SIZE / 2,
          width: OBJECT_SIZE,
          height: OBJECT_SIZE,
          objectFit: 'contain',
          opacity: objectIn,
          transform: `translateY(${bob + (1 - objectIn) * 30}px) scale(${
            0.9 + 0.1 * objectIn
          })`,
        }}
      />

      <div
        data-ui-surface="input"
        style={{
          position: 'absolute',
          top: PILL_TOP,
          left: PILL_LEFT,
          width: PILL_WIDTH,
          height: 116,
          borderRadius: 58,
          background: theme.surface,
          boxShadow: '0 24px 70px rgba(0, 0, 0, 0.18)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: `0 ${PILL_PADDING}px`,
        }}
      >
        <div
          data-ui-critical="prompt-text"
          data-ui-within="input"
          style={{
            ...textStyle('input', theme.surfaceInk),
            width: PILL_WIDTH - PILL_PADDING * 2 - 96,
            opacity: 1 - promptOut,
            transform: `translateX(${-promptOut * 24}px)`,
          }}
        >
          {scene.prompt}
        </div>
        <div
          data-ui-decoration="send"
          style={{
            width: 68,
            height: 68,
            borderRadius: 34,
            background: theme.accent,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            opacity: 1 - promptOut,
            transform: `scale(${1 - promptOut * 0.3})`,
          }}
        >
          <svg width={30} height={30} viewBox="0 0 24 24" aria-hidden>
            <path
              d="M4 20 21 12 4 4l0 6.2L14 12 4 13.8Z"
              fill={theme.accentInk}
            />
          </svg>
        </div>
      </div>

      <div
        style={{
          position: 'absolute',
          top: ANSWER_TOP,
          left: CANVAS.width / 2 - ANSWER_MAX_WIDTH / 2,
          width: ANSWER_MAX_WIDTH,
          display: 'flex',
          justifyContent: 'center',
          textAlign: 'center',
        }}
      >
        <div
          data-ui-critical="answer-text"
          style={textStyle('headline', theme.ink)}
        >
          {answerTokens.map((token, index) => {
            const appear = reveal(frame, answerAt + index * 2, 4);

            return (
              <span
                key={`${token}-${index}`}
                style={{
                  display: 'inline-block',
                  marginRight: '0.24em',
                  opacity: appear,
                  transform: `translateY(${(1 - appear) * 12}px)`,
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

