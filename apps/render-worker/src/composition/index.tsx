import '@fontsource/montserrat/700.css';
import '@fontsource/montserrat/900.css';
import {
  Composition,
  registerRoot,
  type CalculateMetadataFunction,
} from 'remotion';
import { SceneComposition } from './SceneComposition.js';
import {
  DEFAULT_SCENE_INPUT_PROPS,
  SCENE_COMPOSITION_ID,
  SCENE_FPS,
  SCENE_HEIGHT,
  SCENE_WIDTH,
  sceneDurationInFrames,
  sceneInputPropsSchema,
  type SceneInputProps,
} from '../props.js';

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
      defaultProps={DEFAULT_SCENE_INPUT_PROPS}
      calculateMetadata={calculateMetadata}
    />
  );
}

registerRoot(RemotionRoot);
