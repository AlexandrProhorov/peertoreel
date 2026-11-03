import { z } from 'zod';

export const loudnormMeasurementSchema = z.object({
  input_i: z.string(),
  input_tp: z.string(),
  input_lra: z.string(),
  input_thresh: z.string(),
  output_i: z.string(),
  output_tp: z.string(),
  output_lra: z.string(),
  output_thresh: z.string(),
  normalization_type: z.string(),
  target_offset: z.string(),
});

export type LoudnormMeasurement = z.infer<typeof loudnormMeasurementSchema>;

/**
 * FFmpeg prints the loudnorm summary as JSON on stderr, surrounded by log
 * lines. Take the last balanced `{...}` block and validate it.
 */
export function parseLoudnormJson(stderr: string): LoudnormMeasurement {
  const start = stderr.lastIndexOf('{');
  const end = stderr.lastIndexOf('}');

  if (start === -1 || end <= start) {
    throw new Error('loudnorm measurement JSON not found in FFmpeg output');
  }

  return loudnormMeasurementSchema.parse(
    JSON.parse(stderr.slice(start, end + 1)),
  );
}

export interface LoudnormTarget {
  I: number;
  TP: number;
  LRA: number;
}

/** Second-pass filter uses the measured values so the result hits the target. */
export function buildLoudnormFilter(
  target: LoudnormTarget,
  measured: LoudnormMeasurement,
): string {
  return [
    `loudnorm=I=${target.I}`,
    `TP=${target.TP}`,
    `LRA=${target.LRA}`,
    `measured_I=${measured.input_i}`,
    `measured_TP=${measured.input_tp}`,
    `measured_LRA=${measured.input_lra}`,
    `measured_thresh=${measured.input_thresh}`,
    `offset=${measured.target_offset}`,
    'linear=true',
    'print_format=summary',
  ].join(':');
}
