import { describe, expect, it } from 'vitest';
import { buildLoudnormFilter, parseLoudnormJson } from './loudnorm.js';

const stdout = `[Parsed_loudnorm_0 @ 000001] 
{
	"input_i" : "-15.43",
	"input_tp" : "-2.10",
	"input_lra" : "1.20",
	"input_thresh" : "-25.40",
	"output_i" : "-14.00",
	"output_tp" : "-1.50",
	"output_lra" : "1.20",
	"output_thresh" : "-23.90",
	"normalization_type" : "dynamic",
	"target_offset" : "0.05"
}`;

describe('loudnorm two-pass', () => {
  it('parses the measurement block out of FFmpeg logs', () => {
    const measured = parseLoudnormJson(stdout);

    expect(measured.input_i).toBe('-15.43');
    expect(measured.target_offset).toBe('0.05');
  });

  it('builds a second-pass filter from the measurement', () => {
    const measured = parseLoudnormJson(stdout);
    const filter = buildLoudnormFilter({ I: -14, TP: -1.5, LRA: 11 }, measured);

    expect(filter).toContain('loudnorm=I=-14:TP=-1.5:LRA=11');
    expect(filter).toContain('measured_I=-15.43');
    expect(filter).toContain('measured_thresh=-25.40');
    expect(filter).toContain('linear=true');
  });

  it('rejects output without a measurement block', () => {
    expect(() => parseLoudnormJson('no json here')).toThrow(
      'loudnorm measurement JSON not found',
    );
  });
});
