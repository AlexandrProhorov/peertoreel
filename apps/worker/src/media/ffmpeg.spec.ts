import { describe, expect, it } from 'vitest';
import { buildRenderArgs } from './ffmpeg.js';

describe('buildRenderArgs', () => {
  it('keeps the video timeline continuous before burning subtitles', () => {
    const args = buildRenderArgs({
      clipPath: 'visuals.mp4',
      audioPath: 'voiceover.mp3',
      outputName: 'draft.mp4',
      workDir: '/tmp/work',
    });
    const filter = args[args.indexOf('-filter_complex') + 1] ?? '';

    expect(filter).toContain('scale=1080:1920');
    expect(filter).toContain('crop=1080:1920');
    expect(filter).toContain('fps=30');
    expect(filter).not.toContain('setpts');
    expect(filter).toContain('ass=subtitles.ass');
    expect(args).toContain('-shortest');
    expect(args.at(-1)).toBe('draft.mp4');
  });
});
