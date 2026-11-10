import { VIDEO_TARGET } from '@peertoreel/contracts';
import { describe, expect, it } from 'vitest';
import {
  SCENE_FPS,
  SCENE_HEIGHT,
  SCENE_RENDER_MEDIA_OPTIONS,
  SCENE_WIDTH,
} from './video-target.js';

describe('Remotion video target adapter', () => {
  it('maps the contracts specification to composition dimensions', () => {
    expect(SCENE_WIDTH).toBe(VIDEO_TARGET.width);
    expect(SCENE_HEIGHT).toBe(VIDEO_TARGET.height);
    expect(SCENE_FPS).toBe(VIDEO_TARGET.fps);
  });

  it('maps codec, pixel format, colour space and muted audio', () => {
    expect(SCENE_RENDER_MEDIA_OPTIONS).toEqual({
      codec: 'h264',
      pixelFormat: 'yuv420p',
      colorSpace: 'bt709',
      muted: true,
    });
  });
});
