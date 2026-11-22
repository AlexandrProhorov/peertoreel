import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { LOCAL_ASSETS, assetByContentHash, resolveAsset } from './assets.js';
import {
  uiEpisodeFrames,
  uiEpisodeInputPropsSchema,
  uiEpisodeSchema,
  uiSceneFrames,
} from './spec.js';
import { scheduleWords } from './timing.js';

const examplePath = fileURLToPath(
  new URL('./example-episode.json', import.meta.url),
);

function exampleEpisode(): unknown {
  return JSON.parse(readFileSync(examplePath, 'utf8'));
}

describe('ui episode spec', () => {
  it('parses the example episode with three devices', async () => {
    const raw: unknown = JSON.parse(await readFile(examplePath, 'utf8'));
    const episode = uiEpisodeSchema.parse(raw);

    expect(episode.scenes.map((scene) => scene.device)).toEqual([
      'prompt-card',
      'text-selection',
      'chat-reconstruction',
    ]);
    expect(uiEpisodeFrames(episode, 30)).toBe(360);
  });

  it('accepts measured narration lines and rejects a reversed span', () => {
    const raw = exampleEpisode() as {
      scenes: Array<Record<string, unknown>>;
    };
    const scene = raw.scenes[0];

    if (scene === undefined) {
      throw new Error('expected a scene');
    }

    scene['narrationLines'] = [
      { text: 'Первая строка.', startSec: 0, endSec: 1.2 },
    ];

    const episode = uiEpisodeSchema.parse(raw);

    expect(episode.scenes[0]?.narrationLines?.[0]?.text).toBe('Первая строка.');

    scene['narrationLines'] = [{ text: 'Наоборот.', startSec: 2, endSec: 1 }];

    expect(uiEpisodeSchema.safeParse(raw).success).toBe(false);
  });

  it('parses the slider-to-break pilot episode, including the rail break', async () => {
    const pilotPath = fileURLToPath(
      new URL('./pilot/slider-to-break/episode.json', import.meta.url),
    );
    const raw: unknown = JSON.parse(await readFile(pilotPath, 'utf8'));
    const episode = uiEpisodeSchema.parse(raw);
    const scene = episode.scenes[0];

    expect(scene?.device).toBe('spec');

    if (scene?.device !== 'spec') {
      throw new Error('expected a spec scene');
    }

    const rail = scene.spec.elements.find((element) => element.id === 'rail');
    const knob = scene.spec.elements.find((element) => element.id === 'knob');

    expect(rail?.params.breakAt).toBe(0.82);
    expect(rail?.transitions).toContain('break');
    expect(knob?.transitions).toContain('release');
    expect(
      scene.spec.sequence.filter((step) => step.element === 'knob').map((step) => step.transition),
    ).toEqual(['drag', 'release']);
  });

  it('parses all five topic episodes', async () => {
    for (const name of [
      '01-subscriptions',
      '02-doctor',
      '03-discount',
      '04-features',
      '05-delivery',
    ]) {
      const topicPath = fileURLToPath(
        new URL(`./pilot/topics/${name}.json`, import.meta.url),
      );
      const raw: unknown = JSON.parse(await readFile(topicPath, 'utf8'));

      expect(() => uiEpisodeSchema.parse(raw)).not.toThrow();
    }
  });

  it('rejects an unknown device', () => {
    const raw = exampleEpisode() as { scenes: unknown[] };

    raw.scenes[0] = { ...(raw.scenes[0] as object), device: 'carousel' };

    expect(() => uiEpisodeSchema.parse(raw)).toThrow();
  });

  it('rejects a selection index outside the lines', () => {
    const raw = exampleEpisode() as {
      scenes: Array<Record<string, unknown>>;
    };

    raw.scenes[1] = { ...raw.scenes[1], selectionLineIndex: 9 };

    expect(() => uiEpisodeSchema.parse(raw)).toThrow(/selectionLineIndex/);
  });

  it('rejects an asset key outside the local library', () => {
    const raw = exampleEpisode() as {
      scenes: Array<Record<string, unknown>>;
    };

    raw.scenes[2] = {
      ...raw.scenes[2],
      avatar: {
        key: 'unicorn',
        contentHash: LOCAL_ASSETS.owl.contentHash,
      },
    };

    expect(() => uiEpisodeSchema.parse(raw)).toThrow();
  });

  it('rejects an asset whose content hash does not match the library', () => {
    const raw = exampleEpisode() as {
      scenes: Array<Record<string, unknown>>;
    };

    raw.scenes[2] = {
      ...raw.scenes[2],
      avatar: { key: 'owl', contentHash: '0'.repeat(64) },
    };

    expect(() => uiEpisodeSchema.parse(raw)).toThrow(/content changed/);
  });

  it('requires a known theme on the episode', () => {
    const raw = exampleEpisode() as Record<string, unknown>;

    raw.themeId = 'neon';

    expect(() => uiEpisodeSchema.parse(raw)).toThrow();
  });

  it('keeps safe zones opt-in and off by default', () => {
    const parsed = uiEpisodeInputPropsSchema.parse({
      episode: uiEpisodeSchema.parse(exampleEpisode()),
    });

    expect(parsed.showSafeZones).toBe(false);
  });

  it('sums the rounded scene frame counts', () => {
    const episode = uiEpisodeSchema.parse(exampleEpisode());

    expect(
      episode.scenes.reduce(
        (total, scene) => total + uiSceneFrames(scene, 30),
        0,
      ),
    ).toBe(uiEpisodeFrames(episode, 30));
  });
});

describe('asset library', () => {
  it('resolves every library asset by its own content hash', () => {
    for (const asset of Object.values(LOCAL_ASSETS)) {
      expect(assetByContentHash(asset.contentHash)).toEqual(asset);
      expect(
        resolveAsset({ key: asset.key, contentHash: asset.contentHash }).file,
      ).toBe(asset.file);
    }
  });

  it('fails on a hash that belongs to a different asset', () => {
    expect(() =>
      resolveAsset({
        key: 'owl',
        contentHash: LOCAL_ASSETS.panda.contentHash,
      }),
    ).toThrow(/content changed/);
  });
});

describe('mechanism scenes', () => {
  const mechanisms = (): unknown =>
    JSON.parse(
      readFileSync(
        fileURLToPath(new URL('./mechanisms-episode.json', import.meta.url)),
        'utf8',
      ),
    );

  it('parses the three mechanism scenes', () => {
    const episode = uiEpisodeSchema.parse(mechanisms());

    expect(episode.scenes.map((scene) => scene.device)).toEqual([
      'input-transform',
      'impact-arrival',
      'scale-break',
    ]);
  });

  it('rejects a prompt that does not fit one line of the field', () => {
    const raw = mechanisms() as { scenes: Array<Record<string, unknown>> };

    raw.scenes[0] = { ...raw.scenes[0], prompt: 'x'.repeat(35) };

    expect(() => uiEpisodeSchema.parse(raw)).toThrow();
  });

  it('rejects an index longer than three characters', () => {
    const raw = mechanisms() as { scenes: Array<Record<string, unknown>> };

    raw.scenes[1] = { ...raw.scenes[1], index: '0001' };

    expect(() => uiEpisodeSchema.parse(raw)).toThrow();
  });

  it('requires a title on the breaking scale', () => {
    const raw = mechanisms() as { scenes: Array<Record<string, unknown>> };

    raw.scenes[2] = { ...raw.scenes[2], title: '' };

    expect(() => uiEpisodeSchema.parse(raw)).toThrow();
  });
});

describe('spec renderer scene', () => {
  const specEpisode = (): unknown =>
    JSON.parse(
      readFileSync(
        fileURLToPath(new URL('./spec-episode.json', import.meta.url)),
        'utf8',
      ),
    );

  it('parses a composition written in contracted primitives', () => {
    const episode = uiEpisodeSchema.parse(specEpisode());

    expect(episode.scenes[0]?.device).toBe('spec');
  });

  it('rejects a composition with an unknown primitive', () => {
    const raw = specEpisode() as {
      scenes: Array<{ spec: { elements: Array<Record<string, unknown>> } }>;
    };

    raw.scenes[0]!.spec.elements[0] = {
      ...raw.scenes[0]!.spec.elements[0],
      primitive: 'hologram',
    };

    expect(() => uiEpisodeSchema.parse(raw)).toThrow(/unknown primitive/);
  });

  it('rejects a composition with an operation the primitive cannot perform', () => {
    const raw = specEpisode() as {
      scenes: Array<{ spec: { elements: Array<Record<string, unknown>> } }>;
    };

    raw.scenes[0]!.spec.elements[1] = {
      ...raw.scenes[0]!.spec.elements[1],
      operations: ['shatter'],
    };

    expect(() => uiEpisodeSchema.parse(raw)).toThrow(/shatter/);
  });
});

describe('speech schedule', () => {  it('is deterministic and monotonic within the scene duration', () => {
    const first = scheduleWords('раз два три четыре пять', {
      durationSec: 4.3,
      wordsPerSec: 10,
    });
    const second = scheduleWords('раз два три четыре пять', {
      durationSec: 4.3,
      wordsPerSec: 10,
    });

    expect(first).toEqual(second);
    expect(first).toHaveLength(5);

    for (const [index, word] of first.entries()) {
      expect(word.endSec).toBeGreaterThanOrEqual(word.startSec);
      expect(word.startSec).toBeLessThanOrEqual(4.3);

      if (index > 0) {
        expect(word.startSec).toBeGreaterThanOrEqual(
          first[index - 1]?.startSec ?? 0,
        );
      }
    }
  });

  it('compresses long text into the scene instead of overflowing it', () => {
    const words = scheduleWords(
      'Исходя из всех наших разговоров, назови пять вещей, которые ты понял обо мне, хотя я прямо тебе их не говорил.',
      { durationSec: 2, wordsPerSec: 3 },
    );

    expect(Math.max(...words.map((word) => word.startSec))).toBeLessThan(2);
  });
});
