import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import { CANVAS } from './platform.js';
import type { SpeechTrack, UiEpisode } from './spec.js';
import { captionWords, speechTimeline } from './timeline.js';
import { textStyle } from './typography.js';

/**
 * Captions read the speech stream only. A device never uses them to decide when
 * its own content appears: the card can be fully typed while the narration is
 * still on its first line.
 */
export function SpeechCaption({ track }: { track: SpeechTrack }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const timeline = speechTimeline(track);
  const words = captionWords(timeline, frame, fps, 4);

  if (words.length === 0) {
    return null;
  }

  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      <div
        data-ui-decoration="caption"
        style={{
          position: 'absolute',
          bottom: 340,
          left: 0,
          width: CANVAS.width,
          display: 'flex',
          justifyContent: 'center',
        }}
      >
        <div
          style={{
            padding: '18px 34px',
            borderRadius: 24,
            background: 'rgba(11, 11, 12, 0.72)',
            ...textStyle('body', '#FFFFFF'),
            fontSize: 38,
            display: 'flex',
            gap: '0.3em',
          }}
        >
          {words.map((word, index) => (
            <span
              key={`${word.text}-${index}`}
              style={{ opacity: index === 0 ? 1 : 0.72 }}
            >
              {word.text}
            </span>
          ))}
        </div>
      </div>
    </AbsoluteFill>
  );
}

export function sceneSpeechTrack(
  episode: UiEpisode,
  sceneId: string,
): SpeechTrack | null {
  return episode.speech.find((track) => track.sceneId === sceneId) ?? null;
}
