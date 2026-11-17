import { AbsoluteFill, Freeze, useCurrentFrame, useVideoConfig } from 'remotion';
import { CANVAS } from '../platform.js';
import { themeById } from '../themes.js';
import { FONT_FAMILY } from '../typography.js';
import type { UiEpisode } from '../spec.js';
import { uiSceneFrames } from '../spec.js';
import { UiSceneView } from '../UiScene.js';
import { TRANSITION_IDS, transitionFrame, type TransitionId } from './transitions.js';

export const UI_MOTION_COMPOSITION_ID = 'UiMotion';
export const UI_MICRO_COMPOSITION_ID = 'UiMicro';

export type UiMotionProps = {
  readonly transitionId: TransitionId;
  readonly durationSec: number;
  /** Fraction of the clip spent transitioning; the rest holds the scenes. */
  readonly window: number;
};

export const UI_MOTION_DEFAULT_PROPS: UiMotionProps = {
  transitionId: 'cut',
  durationSec: 2.4,
  window: 0.5,
};

/** Two realistic scenes; only the transition differs between renders. */
export const MOTION_EPISODE: UiEpisode = {
  schemaVersion: 1,
  themeId: 'studio-dark',
  captions: false,
  speech: [],
  scenes: [
    {
      id: 'motion-a',
      device: 'title-stack',
      durationSec: 2,
      revealSec: 0.4,
      themeId: 'studio-dark',
      title: 'до перехода',
      subtitle: 'сцена A',
      eyebrow: null,
      align: 'center',
      highlightWords: [],
      icons: [],
      vertical: 'upper',
      centerMark: false,
    },
    {
      id: 'motion-b',
      device: 'title-stack',
      durationSec: 2,
      revealSec: 0.4,
      themeId: 'studio-light',
      title: 'после перехода',
      subtitle: 'сцена B',
      eyebrow: null,
      align: 'center',
      highlightWords: [],
      icons: [],
      vertical: 'upper',
      centerMark: false,
    },
  ],
};

function Layer({
  episode,
  sceneIndex,
  style,
}: {
  episode: UiEpisode;
  sceneIndex: number;
  style: React.CSSProperties;
}) {
  const scene = episode.scenes[sceneIndex];

  if (scene === undefined) {
    return null;
  }

  const { fps } = useVideoConfig();
  const frames = uiSceneFrames(scene, fps);

  return (
    <AbsoluteFill style={style}>
      <Freeze frame={Math.max(1, frames - 6)}>
        <UiSceneView
          episode={episode}
          scene={scene}
          durationInFrames={frames}
        />
      </Freeze>
    </AbsoluteFill>
  );
}

export function UiMotion({ transitionId, durationSec, window }: UiMotionProps) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const total = Math.max(1, Math.round(durationSec * fps));
  const windowFrames = Math.max(1, Math.round(total * window));
  const start = Math.round((total - windowFrames) / 2);
  const progress = (frame - start) / windowFrames;
  const state = transitionFrame(transitionId, progress);
  const theme = themeById('studio-dark');

  return (
    <AbsoluteFill style={{ backgroundColor: theme.background }}>
      <Layer
        episode={MOTION_EPISODE}
        sceneIndex={0}
        style={{
          opacity: state.outgoing.opacity,
          transform: state.outgoing.transform,
          filter: state.outgoing.filter,
          clipPath: state.outgoing.clipPath,
          zIndex: state.outgoing.zIndex,
        }}
      />
      <Layer
        episode={MOTION_EPISODE}
        sceneIndex={1}
        style={{
          opacity: state.incoming.opacity,
          transform: state.incoming.transform,
          filter: state.incoming.filter,
          clipPath: state.incoming.clipPath,
          zIndex: state.incoming.zIndex,
        }}
      />

      <div
        style={{
          position: 'absolute',
          top: 60,
          left: 0,
          width: CANVAS.width,
          textAlign: 'center',
          fontFamily: FONT_FAMILY,
          fontSize: 34,
          fontWeight: 600,
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
          color: '#FFFFFF',
          mixBlendMode: 'difference',
        }}
      >
        {transitionId}
      </div>

      <AbsoluteFill
        style={{
          backgroundColor: '#FFFFFF',
          opacity: state.flash,
          pointerEvents: 'none',
        }}
      />
    </AbsoluteFill>
  );
}

export const TRANSITION_LIST = TRANSITION_IDS;
