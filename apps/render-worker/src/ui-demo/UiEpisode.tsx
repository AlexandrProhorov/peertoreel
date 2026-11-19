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
  CRITICAL_SAFE_BOUNDS,
  PLATFORM_OVERLAY,
} from './platform.js';
import { type UiEpisodeInputProps } from './spec.js';
import { sceneEnterStyle } from './scene-enter.js';
import { placeScenes, sceneExitStyle } from './scene-timeline.js';
import { sceneSpeechTrack, SpeechCaption } from './SpeechCaption.js';
import { FONT_FAMILY, FONT_LOAD_SPECS } from './typography.js';
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

/** A scene arrives with the transition the model chose; the cut becomes motion. */
function SceneEnter({
  enter,
  children,
}: {
  enter: string;
  children: React.ReactNode;
}) {
  const frame = useCurrentFrame();
  const style = sceneEnterStyle(enter, frame);

  return <AbsoluteFill style={style}>{children}</AbsoluteFill>;
}

/**
 * The scene that leaves while the next one arrives. Its movement is the mirror
 * of the incoming entrance, so a slide pushes instead of covering: the two
 * frames stay edge to edge and the black background never shows.
 */
function SceneExit({
  nextEnter,
  durationInFrames,
  overlapFrames,
  children,
}: {
  nextEnter: string | undefined;
  durationInFrames: number;
  overlapFrames: number;
  children: React.ReactNode;
}) {
  const frame = useCurrentFrame();
  const style = sceneExitStyle(nextEnter, frame, durationInFrames, overlapFrames);

  return <AbsoluteFill style={style}>{children}</AbsoluteFill>;
}

/**
 * A degraded scene says so on the frame. The film must never be silently
 * incomplete, and a person reviewing a draft must see where the weak frame is
 * without reading the report. Autoposting filters on the same `degraded` field.
 */
function DegradedMark() {
  return (
    <div
      style={{
        position: 'absolute',
        top: CRITICAL_SAFE_BOUNDS.top,
        left: CRITICAL_SAFE_BOUNDS.right - 52,
        width: 52,
        height: 52,
        borderRadius: 26,
        background: 'rgba(0, 0, 0, 0.72)',
        color: '#FFFFFF',
        fontFamily: FONT_FAMILY,
        fontSize: 40,
        fontWeight: 700,
        lineHeight: '52px',
        textAlign: 'center',
      }}
    >
      *
    </div>
  );
}

export function UiEpisode({ episode, showSafeZones }: UiEpisodeInputProps) {
  useLocalFontsReady('Loading UI demo fonts');
  const { fps } = useVideoConfig();
  const timeline = placeScenes(episode.scenes, fps);

  return (
    <AbsoluteFill
      style={{
        width: CANVAS.width,
        height: CANVAS.height,
        backgroundColor: '#000000',
      }}
    >
      {timeline.placed.map(({ scene, from, durationInFrames }, index) => {
        const first = index === 0;
        const track = episode.captions
          ? sceneSpeechTrack(episode, scene.id)
          : null;
        /* The next scene overlaps this one: a slide pushes this frame out, a fade
           dims it, a wipe and a zoom cover it. The background never shows. */
        const next = timeline.placed[index + 1];

        return (
          <Sequence
            key={scene.id}
            from={from}
            durationInFrames={durationInFrames}
            name={`${scene.device}:${scene.id}`}
          >
            <SceneExit
              nextEnter={next?.scene.enter}
              durationInFrames={durationInFrames}
              overlapFrames={next?.overlap ?? 0}
            >
              <SceneEnter enter={first ? 'cut' : (scene.enter ?? 'cut')}>
                <UiSceneView
                  episode={episode}
                  scene={scene}
                  durationInFrames={durationInFrames}
                />
              </SceneEnter>
            </SceneExit>
            {track === null ? null : <SpeechCaption track={track} />}
            {scene.degraded === undefined ? null : <DegradedMark />}
          </Sequence>
        );
      })}
      {showSafeZones ? <SafeZones /> : null}
    </AbsoluteFill>
  );
}
