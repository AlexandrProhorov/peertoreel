import { describe, expect, it } from 'vitest';
import { buildArtifactKey, isNotFoundError } from './storage.js';

describe('buildArtifactKey', () => {
  it('builds a per-run prefix', () => {
    expect(
      buildArtifactKey('11111111-1111-4111-8111-111111111111', 'voiceover', 'voiceover.mp3'),
    ).toBe('runs/11111111-1111-4111-8111-111111111111/voiceover/voiceover.mp3');
  });

  it('sanitizes names and stages', () => {
    expect(buildArtifactKey('run-1', 'visuals', 'scene 1/cover.jpg')).toBe(
      'runs/run-1/visuals/scene_1_cover.jpg',
    );
  });

  it('rejects empty parts', () => {
    expect(() => buildArtifactKey('', 'render', 'draft.mp4')).toThrow();
    expect(() => buildArtifactKey('run-1', 'render', '')).toThrow();
  });
});

describe('isNotFoundError', () => {
  it('recognizes a missing object and nothing else', () => {
    expect(isNotFoundError({ name: 'NotFound' })).toBe(true);
    expect(isNotFoundError({ name: 'NoSuchKey' })).toBe(true);
    expect(isNotFoundError({ $metadata: { httpStatusCode: 404 } })).toBe(true);
    expect(isNotFoundError({ name: 'AccessDenied', $metadata: { httpStatusCode: 403 } })).toBe(
      false,
    );
    expect(isNotFoundError(new Error('socket hang up'))).toBe(false);
    expect(isNotFoundError(null)).toBe(false);
  });
});
