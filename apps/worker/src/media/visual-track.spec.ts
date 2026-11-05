import { describe, expect, it } from 'vitest';
import {
  buildVisualConcatArgs,
  buildVisualSegmentArgs,
  planVisualTrack,
  type VisualTrackScene,
} from './visual-track.js';

const scenes: VisualTrackScene[] = [
  { idx: 0, kind: 'video', fileName: 'scene-0.mp4', durationSec: 2 },
  { idx: 1, kind: 'image', fileName: 'scene-1.jpg', durationSec: 2 },
];

describe('planVisualTrack', () => {
  it('extends the last scene to the audio length', () => {
    const plan = planVisualTrack(scenes, 6);

    expect(plan.totalDurationSec).toBe(6);
    expect(plan.segments.map((segment) => segment.durationSec)).toEqual([2, 4]);
  });

  it('trims the tail when scenes are longer than the audio', () => {
    const plan = planVisualTrack(scenes, 3);

    expect(plan.totalDurationSec).toBe(3);
    expect(plan.segments.map((segment) => segment.durationSec)).toEqual([2, 1]);
  });

  it('drops fully trimmed segments', () => {
    const plan = planVisualTrack(scenes, 1);

    expect(plan.segments).toHaveLength(1);
    expect(plan.segments[0]?.idx).toBe(0);
    expect(plan.segments[0]?.durationSec).toBe(1);
  });

  it('produces a fallback segment when there are no scenes', () => {
    const plan = planVisualTrack([], 4);

    expect(plan.segments).toEqual([
      { idx: 0, kind: 'fallback', fileName: null, durationSec: 4 },
    ]);
  });

  it('turns an asset without a file into a fallback', () => {
    const plan = planVisualTrack(
      [{ idx: 0, kind: 'video', fileName: null, durationSec: 3 }],
      3,
    );

    expect(plan.segments[0]?.kind).toBe('fallback');
  });
});

describe('buildVisualSegmentArgs', () => {
  it('loops a video and cuts it to the scene duration', () => {
    const args = buildVisualSegmentArgs(
      { idx: 0, kind: 'video', fileName: 'scene-0.mp4', durationSec: 3.5 },
      'out.mp4',
    );

    expect(args).toContain('-stream_loop');
    expect(args[args.indexOf('-i') + 1]).toBe('scene-0.mp4');
    expect(args[args.indexOf('-t') + 1]).toBe('3.500');
    expect(args.join(' ')).toContain('scale=1080:1920');
    expect(args.join(' ')).toContain('crop=1080:1920');
    expect(args.join(' ')).toContain('setsar=1');
    expect(args.join(' ')).toContain('fps=30');
    expect(args.at(-1)).toBe('out.mp4');
  });

  it('loops an image and cuts it to the scene duration', () => {
    const args = buildVisualSegmentArgs(
      { idx: 1, kind: 'image', fileName: 'scene-1.jpg', durationSec: 2 },
      'out.mp4',
    );

    expect(args).toContain('-loop');
    expect(args[args.indexOf('-loop') + 1]).toBe('1');
    expect(args[args.indexOf('-i') + 1]).toBe('scene-1.jpg');
    expect(args[args.indexOf('-t') + 1]).toBe('2.000');
  });

  it('generates testsrc2 for a fallback segment', () => {
    const args = buildVisualSegmentArgs(
      { idx: 2, kind: 'fallback', fileName: null, durationSec: 1.25 },
      'out.mp4',
    );

    expect(args.join(' ')).toContain('testsrc2=size=1080x1920:rate=30:duration=1.250');
    expect(args).toContain('-an');
  });
});

describe('buildVisualConcatArgs', () => {
  it('re-encodes the concat into a continuous CFR timeline', () => {
    const args = buildVisualConcatArgs('visual-segments.txt', 'visuals.mp4');

    expect(args).toContain('-f');
    expect(args[args.indexOf('-f') + 1]).toBe('concat');
    expect(args[args.indexOf('-safe') + 1]).toBe('0');
    expect(args.join(' ')).toContain('fps=30,setsar=1');
    expect(args.join(' ')).not.toContain('setpts');
    expect(args[args.indexOf('-c:v') + 1]).toBe('libx264');
    expect(args[args.indexOf('-r') + 1]).toBe('30');
    expect(args.at(-1)).toBe('visuals.mp4');
  });
});
