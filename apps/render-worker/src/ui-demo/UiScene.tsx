import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { ChatReconstruction } from './devices/ChatReconstruction.js';
import { ImpactArrival } from './devices/ImpactArrival.js';
import { InputTransform } from './devices/InputTransform.js';
import { ObjectReveal } from './devices/ObjectReveal.js';
import { PredictionInput } from './devices/PredictionInput.js';
import { PromptCard } from './devices/PromptCard.js';
import { ScaleBreak } from './devices/ScaleBreak.js';
import { SpecRenderer } from './devices/SpecRenderer.js';
import { SocialProof } from './devices/SocialProof.js';
import { TextSelection } from './devices/TextSelection.js';
import { TitleStack } from './devices/TitleStack.js';
import { CANVAS } from './platform.js';
import {
  sceneThemeId,
  type UiEpisode,
  type UiScene as UiSceneSpec,
} from './spec.js';
import { themeById } from './themes.js';
import { sceneMotion } from './transitions.js';

function Device({
  episode,
  scene,
}: {
  episode: UiEpisode;
  scene: UiSceneSpec;
}) {
  const theme = themeById(sceneThemeId(episode, scene));

  switch (scene.device) {
    case 'prompt-card':
      return <PromptCard scene={scene} theme={theme} />;
    case 'text-selection':
      return <TextSelection scene={scene} theme={theme} />;
    case 'chat-reconstruction':
      return <ChatReconstruction scene={scene} theme={theme} />;
    case 'title-stack':
      return <TitleStack scene={scene} theme={theme} />;
    case 'social-proof':
      return <SocialProof scene={scene} theme={theme} />;
    case 'prediction-input':
      return <PredictionInput scene={scene} theme={theme} />;
    case 'object-reveal':
      return <ObjectReveal scene={scene} />;
    case 'input-transform':
      return <InputTransform scene={scene} theme={theme} />;
    case 'impact-arrival':
      return <ImpactArrival scene={scene} theme={theme} />;
    case 'scale-break':
      return <ScaleBreak scene={scene} theme={theme} />;
    case 'spec':
      return <SpecRenderer scene={scene} theme={theme} />;
  }
}

export function UiSceneView({
  episode,
  scene,
  durationInFrames,
}: {
  episode: UiEpisode;
  scene: UiSceneSpec;
  durationInFrames: number;
}) {
  const frame = useCurrentFrame();
  const theme = themeById(sceneThemeId(episode, scene));
  const motion = sceneMotion(frame, durationInFrames);

  return (
    <AbsoluteFill
      data-ui-stage={scene.id}
      style={{ width: CANVAS.width, height: CANVAS.height, backgroundColor: theme.background }}
    >
      <AbsoluteFill
        data-ui-decoration="grid"
        style={{
          backgroundImage: `linear-gradient(${theme.grid} 1px, transparent 1px), linear-gradient(90deg, ${theme.grid} 1px, transparent 1px)`,
          backgroundSize: '96px 96px',
        }}
      />

      <AbsoluteFill
        style={{
          opacity: motion.opacity,
          willChange: 'opacity',
        }}
      >
        <Device episode={episode} scene={scene} />
      </AbsoluteFill>

      <AbsoluteFill
        data-ui-decoration="flash"
        style={{
          backgroundColor: '#FFFFFF',
          opacity: motion.flash,
          pointerEvents: 'none',
        }}
      />
    </AbsoluteFill>
  );
}
