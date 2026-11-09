import { VIDEO_TARGET, type VideoCodec } from '@peertoreel/contracts';

/**
 * FFmpeg translation of the contracts video target. Remotion has its own
 * adapter (`apps/render-worker/src/video-target.ts`); the two must not share an
 * options object or copy flags from each other.
 *
 * Colour: `ffprobe` on the M3.2 Remotion clips and on the assembled visual track
 * shows `color_space=bt709`, `color_primaries=bt709`, `color_transfer=bt709`
 * already. We therefore do not force `-colorspace`/`-color_primaries`/
 * `-color_trc`: adding them without a failing probe would be an unverified
 * behaviour change. If a future input loses the metadata, this adapter is where
 * the flag mapping belongs (ADR-0012, M3.3).
 */
const FFMPEG_VIDEO_CODECS: Record<VideoCodec, string> = {
  h264: 'libx264',
};

export function ffmpegVideoCodec(codec: VideoCodec = VIDEO_TARGET.codec): string {
  return FFMPEG_VIDEO_CODECS[codec];
}

/** Scale/crop/fps/setsar normalization expressed with target values. */
export const VIDEO_SCALE_FILTER = [
  `scale=${VIDEO_TARGET.width}:${VIDEO_TARGET.height}:force_original_aspect_ratio=increase`,
  `crop=${VIDEO_TARGET.width}:${VIDEO_TARGET.height}`,
  'setsar=1',
  `fps=${VIDEO_TARGET.fps}`,
].join(',');

/** Codec/pixel format/frame rate arguments shared by every FFmpeg encoder path. */
export function buildVideoCodecArgs(): string[] {
  return [
    '-c:v',
    ffmpegVideoCodec(),
    '-pix_fmt',
    VIDEO_TARGET.pixelFormat,
    '-r',
    String(VIDEO_TARGET.fps),
  ];
}
