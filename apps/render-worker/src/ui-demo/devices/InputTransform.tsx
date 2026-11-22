import { useCurrentFrame, useVideoConfig } from 'remotion';
import { CRITICAL_SAFE_BOUNDS } from '../platform.js';
import { Label, Pill } from '../primitives/index.js';
import type { InputTransformScene } from '../spec.js';
import type { UiTheme } from '../themes.js';
import { visualTimeline } from '../timeline.js';
import { reveal } from '../timing.js';

const PILL_WIDTH = 820;
const PILL_HEIGHT = 124;
const PILL_TOP = 900;
const PILL_LEFT =
  (CRITICAL_SAFE_BOUNDS.left + CRITICAL_SAFE_BOUNDS.right - PILL_WIDTH) / 2;
const PADDING = 40;
const BUTTON = 68;
const TEXT_WIDTH = PILL_WIDTH - PADDING * 2 - BUTTON - 16;

/**
 * Mechanism: typing turns the cursor into a submit control, then the field
 * waits. The behaviour is configurable (prompt, waiting label, optional answer),
 * so the same mechanism serves a message box, a command line or a search field.
 */
export function InputTransform({
  scene,
  theme,
}: {
  scene: InputTransformScene;
  theme: UiTheme;
}) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const timeline = visualTimeline(scene, fps);
  const typeStart = timeline.stepFrames[0] ?? timeline.revealFrame;
  const submitAt = timeline.stepFrames[1] ?? Math.round(timeline.durationInFrames * 0.45);
  const waitAt = timeline.stepFrames[2] ?? Math.round(timeline.durationInFrames * 0.7);

  const typedChars = Math.max(
    0,
    Math.min(
      scene.prompt.length,
      Math.round(
        ((frame - typeStart) / Math.max(1, submitAt - typeStart)) * scene.prompt.length,
      ),
    ),
  );
  const morph = Math.min(1, Math.max(0, (frame - submitAt) / 8));
  const waiting = frame >= waitAt;
  const pillIn = reveal(frame, 1, 6);
  const waitingIn = reveal(frame, waitAt, 5);
  const answerIn = reveal(frame, waitAt + 10, 6);

  return (
    <div
      data-ui-device={scene.device}
      data-ui-scene={scene.id}
      style={{ position: 'absolute', inset: 0 }}
    >
      <Pill
        theme={theme}
        background={theme.surface}
        border={theme.border}
        radius={PILL_HEIGHT / 2}
        paddingX={PADDING}
        paddingY={0}
        gap={16}
        shadow="soft"
        style={{
          position: 'absolute',
          top: PILL_TOP,
          left: PILL_LEFT,
          width: PILL_WIDTH,
          height: PILL_HEIGHT,
          opacity: pillIn,
          transform: `translateY(${(1 - pillIn) * 16}px)`,
        }}
        markers={{ surface: 'input' }}
      >
        <Label
          theme={theme}
          token="input"
          tone={waiting ? 'muted' : 'surface'}
          style={{
            width: TEXT_WIDTH,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            opacity: waiting ? 0.4 : 1,
          }}
          markers={{ critical: 'prompt-text', within: 'input' }}
        >
          {scene.prompt.slice(0, typedChars)}
        </Label>

        <div
          style={{
            position: 'absolute',
            right: PADDING,
            top: PILL_HEIGHT / 2 - (44 + 24 * morph) / 2,
            width: 4 + (BUTTON - 4) * morph,
            height: 44 + 24 * morph,
            borderRadius: 2 + 32 * morph,
            background: morph > 0.5 ? theme.accent : theme.ink,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {morph > 0.5 ? (
            <svg width={30} height={30} viewBox="0 0 24 24" aria-hidden style={{ opacity: morph }}>
              <path d="M4 20 21 12 4 4l0 6.2L14 12 4 13.8Z" fill={theme.accentInk} />
            </svg>
          ) : null}
        </div>
      </Pill>

      {waiting ? (
        <Label
          theme={theme}
          token="input"
          tone="muted"
          align="center"
          style={{
            position: 'absolute',
            top: PILL_TOP + 168,
            left: CRITICAL_SAFE_BOUNDS.left,
            width: CRITICAL_SAFE_BOUNDS.right - CRITICAL_SAFE_BOUNDS.left,
            opacity: waitingIn,
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            gap: 14,
          }}
          markers={{ critical: 'waiting-label' }}
        >
          <span>{scene.waitingLabel}</span>
          <span style={{ display: 'flex', gap: 8 }}>
            {[0, 1, 2].map((index) => (
              <span
                key={index}
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: 6,
                  background: theme.accent,
                  opacity:
                    0.45 + 0.55 * (0.5 + 0.5 * Math.sin((frame - index * 4) / 3)),
                }}
              />
            ))}
          </span>
        </Label>
      ) : null}

      {scene.answer === null ? null : (
        <Label
          theme={theme}
          token="headline"
          tone="ink"
          align="center"
          style={{
            position: 'absolute',
            top: PILL_TOP + 220,
            left: CRITICAL_SAFE_BOUNDS.left,
            width: CRITICAL_SAFE_BOUNDS.right - CRITICAL_SAFE_BOUNDS.left,
            opacity: answerIn,
          }}
          markers={{ critical: 'answer-text' }}
        >
          {scene.answer}
        </Label>
      )}
    </div>
  );
}
