import { useEffect, useState } from 'react';
import {
  AbsoluteFill,
  Sequence,
  continueRender,
  delayRender,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import {
  CANVAS,
  PLATFORM_OVERLAY,
} from './platform.js';
import { uiSceneFrames, type UiEpisodeInputProps } from './spec.js';
import { sceneSpeechTrack, SpeechCaption } from './SpeechCaption.js';
import { FONT_LOAD_SPECS } from './typography.js';
import { UiSceneView } from './UiScene.js';

/**
 * Same guard as `SceneComposition`: `document.fonts.ready` can resolve before
 * the first text frame exists, so the weights used by the devices are requested
 * explicitly before any frame is produced or measured.
 */
export function useLocalFontsReady(label: string): void {
  const [handle] = useState(() => delayRender(label));

  useEffect(() => {
    let cancelled = false;

    Promise.all(FONT_LOAD_SPECS.map((spec) => document.fonts.load(spec)))
      .then(() => document.fonts.ready)
      .then(() => {
        if (!cancelled) {
          continueRender(handle);
        }
      })
      .catch(() => {
        if (!cancelled) {
          continueRender(handle);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [handle, label]);
}

function SafeZones() {
  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          height: PLATFORM_OVERLAY.bottom,
          background: 'rgba(255, 0, 64, 0.16)',
          borderTop: '4px dashed rgba(255, 0, 64, 0.9)',
        }}
      />
      <div
        style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          right: 0,
          width: PLATFORM_OVERLAY.right,
          background: 'rgba(255, 0, 64, 0.16)',
          borderLeft: '4px dashed rgba(255, 0, 64, 0.9)',
        }}
      />
    </AbsoluteFill>
  );
}

/** A scene slides in from the chosen side; the cut itself becomes motion. */
const SLIDE_FRAMES = 9;
const SLIDE_FROM: Readonly<Record<string, readonly [number, number]>> = {
  'slide-left': [CANVAS.width, 0],
  'slide-right': [-CANVAS.width, 0],
  'slide-up': [0, CANVAS.height],
  'slide-down': [0, -CANVAS.height],
};

function SceneSlide({
  enter,
  children,
}: {
  enter: string;
  children: React.ReactNode;
}) {
  const frame = useCurrentFrame();
  const from = SLIDE_FROM[enter];

  if (from === undefined) {
    return <AbsoluteFill>{children}</AbsoluteFill>;
  }

  const progress = Math.min(1, frame / SLIDE_FRAMES);
  const x = from[0] * (1 - progress);
  const y = from[1] * (1 - progress);

  return (
    <AbsoluteFill style={{ transform: `translate(${x}px, ${y}px)` }}>
      {children}
    </AbsoluteFill>
  );
}

export function UiEpisode({ episode, showSafeZones }: UiEpisodeInputProps) {
  useLocalFontsReady('Loading UI demo fonts');
  const { fps } = useVideoConfig();
  let cursor = 0;

  const placed = episode.scenes.map((scene) => {
    const durationInFrames = uiSceneFrames(scene, fps);
    const item = { scene, from: cursor, durationInFrames };
    cursor += durationInFrames;

    return item;
  });

  return (
    <AbsoluteFill
      style={{
        width: CANVAS.width,
        height: CANVAS.height,
        backgroundColor: '#000000',
      }}
    >
      {placed.map(({ scene, from, durationInFrames }) => {
        const track = episode.captions
          ? sceneSpeechTrack(episode, scene.id)
          : null;

        return (
          <Sequence
            key={scene.id}
            from={from}
            durationInFrames={durationInFrames}
            name={`${scene.device}:${scene.id}`}
          >
            <SceneSlide enter={scene.enter ?? 'cut'}>
              <UiSceneView
                episode={episode}
                scene={scene}
                durationInFrames={durationInFrames}
              />
            </SceneSlide>
            {track === null ? null : <SpeechCaption track={track} />}
          </Sequence>
        );
      })}
      {showSafeZones ? <SafeZones /> : null}
    </AbsoluteFill>
  );
}
