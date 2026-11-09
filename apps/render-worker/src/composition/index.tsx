import '@fontsource/montserrat/700.css';
import '@fontsource/montserrat/900.css';
import {
  storyboardFixture15Deg,
  wordTimingsFixture15Deg,
} from '@peertoreel/contracts';
import {
  Composition,
  registerRoot,
  type CalculateMetadataFunction,
} from 'remotion';
import { SceneComposition } from './SceneComposition.js';
import {
  SCENE_COMPOSITION_ID,
  SCENE_FPS,
  SCENE_HEIGHT,
  SCENE_WIDTH,
  sceneDurationInFrames,
  sceneInputPropsSchema,
  type SceneInputProps,
} from '../props.js';

const defaultProps: SceneInputProps = {
  scene: storyboardFixture15Deg.scenes[0]!,
  style: storyboardFixture15Deg.style,
  wordTimings: wordTimingsFixture15Deg,
};

const calculateMetadata: CalculateMetadataFunction<SceneInputProps> = ({
  props,
}) => {
  const parsed = sceneInputPropsSchema.parse(props);

  return {
    durationInFrames: sceneDurationInFrames(parsed.scene),
  };
};

function RemotionRoot() {
  return (
    <Composition
      id={SCENE_COMPOSITION_ID}
      component={SceneComposition}
      width={SCENE_WIDTH}
      height={SCENE_HEIGHT}
      fps={SCENE_FPS}
      durationInFrames={1}
      defaultProps={defaultProps}
      calculateMetadata={calculateMetadata}
    />
  );
}

registerRoot(RemotionRoot);
