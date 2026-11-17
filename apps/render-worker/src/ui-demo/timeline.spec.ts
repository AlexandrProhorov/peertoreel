import { describe, expect, it } from 'vitest';
import type { DerivedWord } from '@peertoreel/contracts';
import { lintFrameFor } from './lint/UiLint.js';
import { lintMeasurements } from './lint/rules.js';
import type { SceneMeasurement } from './lint/measure.js';
import { DEVICE_CONTRACTS } from './lint/rules.js';
import { implementationById } from './catalog.js';
import { uiDeviceSchema, type UiScene } from './spec.js';
import {
  captionWords,
  spokenWord,
  spokenWordIndex,
  speechTimeline,
  visualTimeline,
} from './timeline.js';

const promptScene: UiScene = {
  id: 'prompt',
  device: 'prompt-card',
  durationSec: 4,
  revealSec: 1.4,
  badge: { label: 'AI-чат', mark: 'star' },
  cardText: 'один два три четыре пять',
  caption: null,
};

const words: DerivedWord[] = [
  { text: 'один', startSec: 0, endSec: 0.4 },
  { text: 'два', startSec: 0.5, endSec: 0.9 },
  { text: 'три', startSec: 1, endSec: 1.4 },
];

describe('visual timeline', () => {
  it('reveals content inside the scene without any speech track', () => {
    const timeline = visualTimeline(promptScene, 30);

    expect(timeline.durationInFrames).toBe(120);
    expect(timeline.stepFrames).toHaveLength(5);
    expect(Math.max(...timeline.stepFrames)).toBeLessThan(120);
    expect(timeline.revealWindowFrames).toBe(42);
  });

  it('is deterministic for the same scene', () => {
    expect(visualTimeline(promptScene, 30)).toEqual(
      visualTimeline(promptScene, 30),
    );
  });

  it('does not change when the speech track changes', () => {
    const withoutSpeech = visualTimeline(promptScene, 30);
    const shortSpeech = speechTimeline({ sceneId: 'prompt', words });
    const longSpeech = speechTimeline({
      sceneId: 'prompt',
      words: [...words, { text: 'четыре', startSec: 3.2, endSec: 3.6 }],
    });

    // Speech is a separate stream: reading it must not move the visual steps.
    expect(spokenWordIndex(shortSpeech, 29, 30)).toBe(1);
    expect(spokenWordIndex(longSpeech, 29, 30)).toBe(1);
    expect(spokenWordIndex(shortSpeech, 30, 30)).toBe(2);
    expect(visualTimeline(promptScene, 30)).toEqual(withoutSpeech);
  });

  it('derives chat message steps from authored visual times', () => {
    const chat: UiScene = {
      id: 'chat',
      device: 'chat-reconstruction',
      durationSec: 4,
      revealSec: 1,
      title: 'чат',
      avatar: {
        key: 'owl',
        contentHash:
          '7dfcdcdebd599787719d98f3057b0822522678e6752369ca3498a780ca7ba443',
      },
      messages: [
        { text: 'первое', appearAtSec: 0.5 },
        { text: 'второе', appearAtSec: 2 },
      ],
    };

    expect(visualTimeline(chat, 30).stepFrames).toEqual([15, 60]);
  });
});

describe('speech timeline', () => {
  it('reports the spoken word and caption window', () => {
    const timeline = speechTimeline({ sceneId: 'prompt', words });

    expect(spokenWordIndex(timeline, 0, 30)).toBe(0);
    expect(spokenWordIndex(timeline, 16, 30)).toBe(1);
    expect(spokenWordIndex(timeline, 45, 30)).toBe(2);
    expect(spokenWord(timeline, 16, 30)?.text).toBe('два');
    expect(captionWords(timeline, 16, 30, 2).map((word) => word.text)).toEqual([
      'два',
      'три',
    ]);
  });

  it('returns nothing before the first word', () => {
    const timeline = speechTimeline({
      sceneId: 'prompt',
      words: [{ text: 'позже', startSec: 1, endSec: 1.4 }],
    });

    expect(spokenWord(timeline, 10, 30)).toBeNull();
    expect(captionWords(timeline, 10, 30)).toEqual([]);
  });
});

const RENDERER_DEVICES = new Set(['spec']);

describe('lint wiring', () => {
  it('has a contract for every device the schema accepts', () => {
    for (const device of uiDeviceSchema.options) {
      if (RENDERER_DEVICES.has(device)) {
        continue;
      }

      expect(DEVICE_CONTRACTS[device].requiredRoles.length).toBeGreaterThan(0);
    }
  });

  it('has a catalog implementation for every device except the spec renderer', () => {
    for (const device of uiDeviceSchema.options) {
      if (RENDERER_DEVICES.has(device)) {
        continue;
      }

      expect(implementationById(device), `catalog entry for ${device}`).not.toBeNull();
    }
  });

  it('measures settled frames before the exit animation and early frames after the entrance', () => {
    expect(lintFrameFor(120, 'settled')).toBe(114);
    expect(lintFrameFor(120, 'early')).toBe(7);
    expect(lintFrameFor(4, 'settled')).toBe(1);
  });

  it('passes a scene that only contains a correctly placed title', () => {
    const measurement: SceneMeasurement = {
      sceneId: 'title',
      device: 'title-stack',
      frame: 40,
      fontsReady: true,
      boxes: [
        {
          kind: 'device',
          name: 'title-stack',
          rect: { x: 0, y: 0, width: 1080, height: 1920 },
        },
        {
          kind: 'critical',
          name: 'title',
          rect: { x: 200, y: 420, width: 680, height: 200 },
          fontFamily: 'Onest, sans-serif',
        },
      ],
    };

    expect(lintMeasurements([measurement])).toEqual([]);
  });
});
