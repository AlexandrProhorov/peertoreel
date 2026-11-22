import '@fontsource/onest/400.css';
import '@fontsource/onest/500.css';
import '@fontsource/onest/600.css';
import '@fontsource/onest/700.css';
import '@fontsource/onest/800.css';
import {
  Composition,
  registerRoot,
  type CalculateMetadataFunction,
} from 'remotion';
import { SCENE_FPS, SCENE_HEIGHT, SCENE_WIDTH } from '../video-target.js';
import { UI_LINT_DEFAULT_PROPS, UiLint, type UiLintProps } from './lint/UiLint.js';
import {
  UI_MICRO_COMPOSITION_ID,
  UI_MOTION_COMPOSITION_ID,
  UI_MOTION_DEFAULT_PROPS,
  UiMotion,
  type UiMotionProps,
} from './motion/UiMotion.js';
import {
  UI_MICRO_DEFAULT_PROPS,
  UiMicro,
  type UiMicroProps,
} from './motion/UiMicro.js';
import {
  UI_EPISODE_COMPOSITION_ID,
  UI_LINT_COMPOSITION_ID,
  uiEpisodeFrames,
  uiEpisodeInputPropsSchema,
  uiSceneFrames,
  type UiEpisode as UiEpisodeSpec,
  type UiEpisodeInputProps,
} from './spec.js';
import { UiEpisode } from './UiEpisode.js';

const calculateMetadata: CalculateMetadataFunction<UiEpisodeInputProps> = ({
  props,
}) => {
  const parsed = uiEpisodeInputPropsSchema.parse(props);

  return {
    durationInFrames: uiEpisodeFrames(parsed.episode, SCENE_FPS),
  };
};

/** Neutral preview for Remotion Studio; the CLI always supplies real props. */
const PREVIEW_EPISODE: UiEpisodeSpec = {
  schemaVersion: 1,
  themeId: 'studio-dark',
  captions: false,
  speech: [],
  scenes: [
    {
      id: 'preview',
      device: 'prompt-card',
      durationSec: 3,
      revealSec: 1.8,
      badge: { label: 'AI-чат', mark: 'star' },
      cardText: 'Превью интерфейсной сцены',
      caption: null,
    },
  ],
};

function RemotionRoot() {
  return (
    <>
      <Composition
        id={UI_EPISODE_COMPOSITION_ID}
        component={UiEpisode}
        width={SCENE_WIDTH}
        height={SCENE_HEIGHT}
        fps={SCENE_FPS}
        durationInFrames={1}
        defaultProps={{ episode: PREVIEW_EPISODE, showSafeZones: false }}
        calculateMetadata={calculateMetadata}
      />
      <Composition
        id={UI_LINT_COMPOSITION_ID}
        component={UiLint}
        width={SCENE_WIDTH}
        height={SCENE_HEIGHT}
        fps={SCENE_FPS}
        durationInFrames={1}
        defaultProps={UI_LINT_DEFAULT_PROPS}
        calculateMetadata={
          (({ props }) => ({
            /* Long enough for `Freeze` to reach any measurement frame: the
               composition frame is only a carrier, one scene is measured per
               DOM block. */
            durationInFrames:
              Math.max(
                ...props.episode.scenes.map((scene) =>
                  uiSceneFrames(scene, SCENE_FPS),
                ),
              ) + 10,
            props,
          })) satisfies CalculateMetadataFunction<UiLintProps>
        }
      />
      <Composition
        id={UI_MOTION_COMPOSITION_ID}
        component={UiMotion}
        width={SCENE_WIDTH}
        height={SCENE_HEIGHT}
        fps={SCENE_FPS}
        durationInFrames={72}
        defaultProps={UI_MOTION_DEFAULT_PROPS}
        calculateMetadata={(({ props }) => ({
          durationInFrames: Math.max(2, Math.round(props.durationSec * SCENE_FPS)),
          props,
        })) satisfies CalculateMetadataFunction<UiMotionProps>}
      />
      <Composition
        id={UI_MICRO_COMPOSITION_ID}
        component={UiMicro}
        width={SCENE_WIDTH}
        height={SCENE_HEIGHT}
        fps={SCENE_FPS}
        durationInFrames={120}
        defaultProps={UI_MICRO_DEFAULT_PROPS}
        calculateMetadata={(({ props }) => ({
          durationInFrames: Math.max(2, Math.round(props.durationSec * SCENE_FPS)),
          props,
        })) satisfies CalculateMetadataFunction<UiMicroProps>}
      />
    </>
  );
}

registerRoot(RemotionRoot);
