import { AbsoluteFill, Freeze, useVideoConfig } from 'remotion';
import { CANVAS } from '../platform.js';
import type { UiEpisode } from '../spec.js';
import { uiSceneFrames } from '../spec.js';
import { useLocalFontsReady } from '../UiEpisode.js';import { UiSceneView } from '../UiScene.js';
import { LintProbe } from './probe.js';

export type LintFramePolicy = 'settled' | 'early';

export type UiLintProps = {
  readonly episode: UiEpisode;
  readonly policy: LintFramePolicy;
};

export const UI_LINT_DEFAULT_PROPS: UiLintProps = {
  policy: 'settled',
  episode: {
    schemaVersion: 1,
    themeId: 'studio-dark',
    captions: false,
    speech: [],
    scenes: [
      {
        id: 'lint-preview',
        device: 'prompt-card',
        durationSec: 2,
        revealSec: 1,
        badge: { label: 'AI-чат', mark: 'star' },
        cardText: 'Превью линтера',
        caption: null,
      },
    ],
  },
};

/** Frame used for measurement: before the exit animation, after the entrance. */
export function lintFrameFor(
  sceneFrames: number,
  policy: LintFramePolicy,
): number {
  return policy === 'settled'
    ? Math.max(1, sceneFrames - 6)
    : Math.min(Math.max(1, sceneFrames - 1), 7);
}

export function UiLint({ episode, policy }: UiLintProps) {
  useLocalFontsReady('Loading fonts for ui-lint');
  const { fps } = useVideoConfig();

  return (
    <AbsoluteFill
      style={{ width: CANVAS.width, height: CANVAS.height, backgroundColor: '#000000' }}
    >
      {episode.scenes.map((scene, index) => {
        const durationInFrames = uiSceneFrames(scene, fps);
        const frame = lintFrameFor(durationInFrames, policy);

        return (
          <div
            key={scene.id}
            data-ui-lint-scene={scene.id}
            data-ui-frame={frame}
            style={{
              position: 'absolute',
              top: index * CANVAS.height,
              left: 0,
              width: CANVAS.width,
              height: CANVAS.height,
            }}
          >
            <Freeze frame={frame}>
              <UiSceneView
                episode={episode}
                scene={scene}
                durationInFrames={durationInFrames}
              />
            </Freeze>
          </div>
        );
      })}
      <LintProbe />
    </AbsoluteFill>
  );
}
