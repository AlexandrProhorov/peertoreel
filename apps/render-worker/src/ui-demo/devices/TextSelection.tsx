import { spring, useCurrentFrame, useVideoConfig } from 'remotion';
import {
  CANVAS,
  CRITICAL_SAFE_BOUNDS,
} from '../platform.js';
import type { TextSelectionScene } from '../spec.js';
import type { UiTheme } from '../themes.js';
import { visualTimeline } from '../timeline.js';
import { reveal } from '../timing.js';
import { textStyle } from '../typography.js';

const TITLE_TOP = 470;
const LINES_TOP = 700;
/** Lines are centred, so the width cap is twice the distance to the safe edge. */
const LINE_MAX_WIDTH =
  2 * (CRITICAL_SAFE_BOUNDS.right - CANVAS.width / 2);

function SelectionHandles({
  theme,
  progress,
}: {
  theme: UiTheme;
  progress: number;
}) {
  if (progress <= 0) {
    return null;
  }

  const handle = {
    position: 'absolute' as const,
    width: 14,
    height: 14,
    background: theme.accent,
    border: `3px solid ${theme.background}`,
    borderRadius: 3,
    opacity: progress,
    transform: `scale(${0.6 + 0.4 * progress})`,
  };

  return (
    <div data-ui-decoration="selection-handles" style={{ position: 'absolute', inset: 0 }}>
      <div style={{ ...handle, left: -27, top: -27 }} />
      <div style={{ ...handle, right: -27, top: -27 }} />
      <div style={{ ...handle, left: -27, bottom: -27 }} />
      <div style={{ ...handle, right: -27, bottom: -27 }} />
    </div>
  );
}

export function TextSelection({
  scene,
  theme,
}: {
  scene: TextSelectionScene;
  theme: UiTheme;
}) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const timeline = visualTimeline(scene, fps);
  const titleIn = reveal(frame, timeline.titleFrame, 6);

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
          left: CANVAS.width / 2 - LINE_MAX_WIDTH / 2,
          width: LINE_MAX_WIDTH,
          display: 'flex',
          justifyContent: 'center',
          textAlign: 'center',
          opacity: titleIn,
          transform: `translateY(${(1 - titleIn) * 14}px)`,
        }}
      >
        <div
          data-ui-critical="title"
          style={textStyle('display', theme.ink)}
        >
          {scene.title}
        </div>
      </div>

      <div
        style={{
          position: 'absolute',
          top: LINES_TOP,
          left: CANVAS.width / 2 - LINE_MAX_WIDTH / 2,
          width: LINE_MAX_WIDTH,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 44,
        }}
      >
        {scene.lines.map((line, index) => {
          const lineIn = reveal(
            frame,
            timeline.stepFrames[index] ?? timeline.revealFrame,
            5,
          );

          if (index !== scene.selectionLineIndex) {
            return (
              <div
                key={line}
                data-ui-critical="line"
                style={{
                  ...textStyle('body', theme.muted),
                  opacity: lineIn,
                  transform: `translateY(${(1 - lineIn) * 10}px)`,
                }}
              >
                {line}
              </div>
            );
          }

          const grow = Math.min(
            1,
            spring({
              frame:
                frame -
                Math.round(
                  ((timeline.stepFrames[index] ?? timeline.revealFrame) / fps +
                    0.18) *
                    fps,
                ),
              fps,
              config: { damping: 200, mass: 0.6 },
            }),
          );
          const handles = reveal(
            frame,
            (timeline.stepFrames[index] ?? timeline.revealFrame) + 4,
            4,
          );

          return (
            <div
              key={line}
              style={{
                position: 'relative',
                marginTop: 10,
                marginBottom: 10,
              }}
            >
              <div
                data-ui-decoration="selection-highlight"
                style={{
                  position: 'absolute',
                  inset: 0,
                  borderRadius: 8,
                  background: theme.accent,
                  clipPath: `inset(0 ${(1 - grow) * 100}% 0 0)`,
                  opacity: lineIn,
                }}
              />
              <div
                data-ui-critical="selected-line"
                style={{
                  position: 'relative',
                  padding: '6px 20px',
                  ...textStyle('selection', theme.accentInk),
                  opacity: lineIn,
                }}
              >
                {line}
              </div>
              <SelectionHandles theme={theme} progress={handles} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
