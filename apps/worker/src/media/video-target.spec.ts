import { VIDEO_TARGET } from '@peertoreel/contracts';
import { describe, expect, it } from 'vitest';
import {
  VIDEO_SCALE_FILTER,
  buildVideoCodecArgs,
  ffmpegVideoCodec,
} from './video-target.js';

describe('FFmpeg video target adapter', () => {
  it('maps the H.264 target to libx264', () => {
    expect(ffmpegVideoCodec()).toBe('libx264');
  });

  it('maps codec, pixel format and frame rate to FFmpeg arguments', () => {
    const args = buildVideoCodecArgs();

    expect(args[args.indexOf('-c:v') + 1]).toBe('libx264');
    expect(args[args.indexOf('-pix_fmt') + 1]).toBe(VIDEO_TARGET.pixelFormat);
    expect(args[args.indexOf('-r') + 1]).toBe(String(VIDEO_TARGET.fps));
  });

  it('expresses the target size and frame rate in the scale filter', () => {
    expect(VIDEO_SCALE_FILTER).toContain('scale=1080:1920');
    expect(VIDEO_SCALE_FILTER).toContain('crop=1080:1920');
    expect(VIDEO_SCALE_FILTER).toContain('setsar=1');
    expect(VIDEO_SCALE_FILTER).toContain('fps=30');
  });

  it('does not force colour flags without a failing ffprobe', () => {
    const args = buildVideoCodecArgs().join(' ');

    expect(args).not.toContain('colorspace');
    expect(args).not.toContain('color_primaries');
    expect(args).not.toContain('color_trc');
  });
});
