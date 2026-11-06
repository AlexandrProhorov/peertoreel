import { describe, expect, it } from 'vitest';
import { parseAudioPacketGaps, parseFfprobeJson } from './ffprobe.js';

describe('parseFfprobeJson', () => {
  it('reads format and per-stream durations', () => {
    const result = parseFfprobeJson(
      JSON.stringify({
        format: { duration: '47.900000' },
        streams: [
          { codec_type: 'video', duration: '47.866667' },
          { codec_type: 'audio', duration: '47.900000' },
        ],
      }),
    );

    expect(result).toEqual({
      durationSec: 47.9,
      audioDurationSec: 47.9,
      videoDurationSec: 47.866667,
    });
  });

  it('falls back to the format duration for a missing stream duration', () => {
    const result = parseFfprobeJson(
      JSON.stringify({
        format: { duration: '10' },
        streams: [{ codec_type: 'audio' }],
      }),
    );

    expect(result.audioDurationSec).toBe(10);
    expect(result.videoDurationSec).toBe(10);
  });

  it('rejects an invalid duration', () => {
    expect(() =>
      parseFfprobeJson(
        JSON.stringify({ format: { duration: 'N/A' }, streams: [] }),
      ),
    ).toThrow('invalid duration');
  });
});

describe('parseAudioPacketGaps', () => {
  it('detects a real audio gap', () => {
    const csv = ['0.000,0.021', '0.021,0.021', '0.042,0.021', '3.100,0.021'].join(
      '\n',
    );

    expect(parseAudioPacketGaps(csv)).toEqual([3.058]);
  });

  it('ignores normal packet spacing and small jitter', () => {
    const csv = ['0.000,0.021', '0.021,0.021', '0.042,0.021'].join('\n');

    expect(parseAudioPacketGaps(csv)).toEqual([]);
  });

  it('sorts out-of-order packet rows', () => {
    const csv = ['0.042,0.021', '0.000,0.021', '0.021,0.021'].join('\n');

    expect(parseAudioPacketGaps(csv)).toEqual([]);
  });
});
