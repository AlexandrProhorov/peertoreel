import type {
  DerivedWord,
  SceneObject,
  StoryboardScene,
  StoryboardStyle,
} from '@peertoreel/contracts';
import {
  AbsoluteFill,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import { objectAccentSec, objectWindowSec } from '../timing.js';
import {
  CharacterLayer,
  LightLayer,
  OverlayLayer,
  ParticlesLayer,
} from './layers/AmbientLayers.js';
import { BatteryGauge } from './layers/ChartLayers.js';
import { sceneObjectRenderer } from './layers/layer-kind.js';
import { SceneTextObject } from './layers/TextLayer.js';
import { SubjectLayer } from './layers/SubjectLayer.js';

interface SceneObjectsProps {
  scene: StoryboardScene;
  style: StoryboardStyle;
  wordTimings?: readonly DerivedWord[];
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function ObjectVisual({
  object,
  style,
  seconds,
  progress,
  animationProgress,
  accentPulse,
}: {
  object: SceneObject;
  style: StoryboardStyle;
  seconds: number;
  progress: number;
  animationProgress: number;
  accentPulse: number;
}) {
  switch (sceneObjectRenderer(object.kind)) {
    case 'text':
      return (
        <SceneTextObject
          object={object}
          style={style}
          progress={progress}
          accentPulse={accentPulse}
        />
      );
    case 'particles':
      return (
        <ParticlesLayer
          content={object.content ?? ''}
          seconds={seconds}
          style={style}
        />
      );
    case 'light':
      return (
        <LightLayer
          content={object.content ?? ''}
          seconds={seconds}
          style={style}
        />
      );
    case 'overlay':
      return <OverlayLayer progress={progress} style={style} />;
    case 'character':
      return (
        <CharacterLayer
          content={object.content ?? ''}
          seconds={seconds}
          style={style}
        />
      );
    case 'chart':
      return object.content === 'battery-gauge' ? (
        <BatteryGauge animationProgress={animationProgress} style={style} />
      ) : null;
    case 'asset': {
      if (!object.content) {
        return null;
      }

      return (
        <AbsoluteFill
          style={{
            alignItems: 'center',
            justifyContent: 'center',
            padding: '0 17%',
          }}
        >
          <SubjectLayer
            assetKey={object.content}
            progress={animationProgress}
            opacity={progress}
            style={style}
            widthPercent={100}
          />
        </AbsoluteFill>
      );
    }
    case 'none':
      // Declared in v1, intentionally not rendered (no per-topic shapes).
      return null;
    default:
      throw new Error(
        `Unsupported scene object kind "${String(
          (object as SceneObject).kind,
        )}"`,
      );
  }
}

/**
 * Thin dispatcher over the reusable layer components. Timing stays here so
 * legacy `scene.objects` scenes render exactly as before (M3.3 behaviour).
 */
export function SceneObjects({
  scene,
  style,
  wordTimings,
}: SceneObjectsProps) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const seconds = frame / fps;

  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      {scene.objects.map((object) => {
        const window = objectWindowSec(scene, object, wordTimings);
        const accentSec = objectAccentSec(scene, object, wordTimings);

        if (window.endSec <= window.startSec) {
          return null;
        }

        const visibleFrom = Math.max(0, window.startSec - 0.18);

        if (seconds < visibleFrom || seconds > window.endSec) {
          return null;
        }

        const appear = interpolate(
          seconds,
          [visibleFrom, Math.min(visibleFrom + 0.35, window.endSec)],
          [0, 1],
          { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
        );
        const disappear = interpolate(
          seconds,
          [Math.max(window.endSec - 0.25, window.startSec), window.endSec],
          [1, 0],
          { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
        );
        const animationProgress = clamp(
          (seconds - window.startSec) /
            Math.max(0.001, window.endSec - window.startSec),
          0,
          1,
        );
        const accentPulse =
          accentSec === null
            ? 0
            : interpolate(
                seconds,
                [accentSec - 0.12, accentSec, accentSec + 0.35],
                [0, 1, 0],
                { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
              );

        return (
          <ObjectVisual
            key={object.id}
            object={object}
            style={style}
            seconds={seconds}
            progress={Math.min(appear, disappear)}
            animationProgress={animationProgress}
            accentPulse={accentPulse}
          />
        );
      })}
    </AbsoluteFill>
  );
}
