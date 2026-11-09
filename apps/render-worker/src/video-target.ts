import { VIDEO_TARGET } from '@peertoreel/contracts';

/**
 * Remotion translation of the contracts video target. FFmpeg has its own
 * adapter (`apps/worker/src/media/video-target.ts`); do not share an options
 * object between them.
 *
 * Remotion owns these literals: `codec: 'h264'`, `pixelFormat: 'yuv420p'`,
 * `colorSpace: 'bt709'`. `muted: true` comes from `hasAudio: false` in the
 * target.
 */
export const SCENE_WIDTH = VIDEO_TARGET.width;
export const SCENE_HEIGHT = VIDEO_TARGET.height;
export const SCENE_FPS = VIDEO_TARGET.fps;

export const SCENE_RENDER_MEDIA_OPTIONS = {
  codec: VIDEO_TARGET.codec,
  pixelFormat: VIDEO_TARGET.pixelFormat,
  colorSpace: VIDEO_TARGET.colorSpace,
  muted: !VIDEO_TARGET.hasAudio,
} as const;
