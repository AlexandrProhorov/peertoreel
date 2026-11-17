import { useCurrentFrame, useVideoConfig } from 'remotion';
import { CANVAS, CRITICAL_SAFE_BOUNDS } from '../platform.js';
import { Label, Line } from '../primitives/index.js';
import type { ScaleBreakScene } from '../spec.js';
import type { UiTheme } from '../themes.js';
import { visualTimeline } from '../timeline.js';
import { reveal } from '../timing.js';

const Y = 1040;
const LEFT = 165;
const RIGHT = CRITICAL_SAFE_BOUNDS.right;
/** The line stops here on purpose: the break is the point of the scene. */
const BREAK_RATIO = 0.78;
const BREAK_X = LEFT + (RIGHT - LEFT) * BREAK_RATIO;
const LABEL_WIDTH = 320;

/**
 * Mechanism: motion along a scale that deliberately breaks instead of finishing.
 * The value never lands; the missing segment communicates "this is where it
 * stays if nothing changes".
 */
export function ScaleBreak({
  scene,
  theme,
}: {
  scene: ScaleBreakScene;
  theme: UiTheme;
}) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const timeline = visualTimeline(scene, fps);
  const startFrame = timeline.stepFrames[0] ?? timeline.revealFrame;
  const breakFrame = timeline.stepFrames[1] ?? Math.round(timeline.durationInFrames * 0.62);

  const draw = Math.min(
    1,
    Math.max(0, (frame - startFrame) / Math.max(1, breakFrame - startFrame)),
  );
  const thumbX = LEFT + (BREAK_X - LEFT) * draw;
  const broken = frame >= breakFrame;
  const breakIn = reveal(frame, breakFrame, 8);
  const titleIn = reveal(frame, breakFrame + 6, 6);

  return (
    <div
      data-ui-device={scene.device}
      data-ui-scene={scene.id}
      style={{ position: 'absolute', inset: 0 }}
    >
      <Line
        color={theme.accent}
        width={6}
        fromX={LEFT}
        fromY={Y}
        toX={thumbX}
        toY={Y}
        markers={{ decoration: 'scale-track' }}
      />

      {broken ? (
        <Line
          color={theme.muted}
          width={3}
          dashed
          fromX={BREAK_X + 28}
          fromY={Y}
          toX={RIGHT}
          toY={Y + 28}
          style={{ opacity: breakIn * 0.6 }}
          markers={{ decoration: 'scale-void' }}
        />
      ) : null}

      <div
        data-ui-decoration="scale-thumb"
        style={{
          position: 'absolute',
          left: thumbX - 18,
          top: Y - 18,
          width: 36,
          height: 36,
          borderRadius: 18,
          background: theme.accent,
          transform: `scale(${broken ? 1 + 0.08 * breakIn : 1})`,
        }}
      />

      <Label
        theme={theme}
        token="label"
        tone="muted"
        style={{ position: 'absolute', top: Y - 96, left: LEFT, width: LABEL_WIDTH }}
        markers={{ critical: 'from-label' }}
      >
        {scene.fromLabel}
      </Label>

      <Label
        theme={theme}
        token="label"
        tone="muted"
        align="right"
        style={{
          position: 'absolute',
          top: Y - 96,
          left: RIGHT - LABEL_WIDTH,
          width: LABEL_WIDTH,
        }}
        markers={{ critical: 'to-label' }}
      >
        {scene.toLabel}
      </Label>

      <Label
        theme={theme}
        token="headline"
        tone="ink"
        align="center"
        style={{
          position: 'absolute',
          top: Y + 150,
          left: CANVAS.width / 2 - 350,
          width: 700,
          opacity: titleIn,
        }}
        markers={{ critical: 'title' }}
      >
        {scene.title}
      </Label>
    </div>
  );
}
