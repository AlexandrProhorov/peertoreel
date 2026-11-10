/**
 * Target format of every rendered scene clip.
 *
 * This is a specification, not a renderer options object. Remotion and FFmpeg
 * translate it into their own parameters independently: Remotion via
 * `codec`/`pixelFormat`/`colorSpace`, FFmpeg via `libx264`/`-pix_fmt`/`-r`.
 * Do not spread this object into either adapter — see ADR-0012 (M3.3).
 *
 * Audio is intentionally absent: voiceover, loudnorm and ASS karaoke are added
 * by the main worker's FFmpeg assembly, never by the scene renderer.
 */
export const VIDEO_TARGET = {
  width: 1080,
  height: 1920,
  fps: 30,
  codec: 'h264',
  pixelFormat: 'yuv420p',
  colorSpace: 'bt709',
  colorPrimaries: 'bt709',
  colorTransfer: 'bt709',
  hasAudio: false,
} as const;

export type VideoTarget = typeof VIDEO_TARGET;
export type VideoCodec = VideoTarget['codec'];
export type VideoPixelFormat = VideoTarget['pixelFormat'];
export type VideoColorSpace = VideoTarget['colorSpace'];
