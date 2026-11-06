import { z } from 'zod';

export const qcVerdictSchema = z.enum(['pass', 'warn', 'fail']);
export type QcVerdict = z.infer<typeof qcVerdictSchema>;

export const qcCheckIdSchema = z.enum([
  'duration',
  'loudness',
  'sync',
  'stop_words',
  'aigc',
  'readability',
]);
export type QcCheckId = z.infer<typeof qcCheckIdSchema>;

export const qcCheckSchema = z.object({
  id: qcCheckIdSchema,
  status: qcVerdictSchema,
  message: z.string().min(1),
});
export type QcCheck = z.infer<typeof qcCheckSchema>;

export const qcMetricsSchema = z.object({
  durationSec: z.number().nonnegative(),
  audioDurationSec: z.number().nonnegative(),
  videoDurationSec: z.number().nonnegative(),
  integratedLufs: z.number(),
  truePeakDb: z.number(),
  loudnessRange: z.number().nonnegative(),
  words: z.number().int().nonnegative(),
  wordsPerMinute: z.number().nonnegative(),
  maxSentenceWords: z.number().int().nonnegative(),
  /** Audio packet gaps longer than 50 ms, in seconds. */
  audioGaps: z.array(z.number().nonnegative()),
  stopWords: z.array(z.string()),
  isAigc: z.boolean(),
});
export type QcMetrics = z.infer<typeof qcMetricsSchema>;

export const qcReportSchema = z.object({
  verdict: qcVerdictSchema,
  checks: z.array(qcCheckSchema).min(1),
  metrics: qcMetricsSchema,
  createdAt: z.iso.datetime(),
});
export type QcReport = z.infer<typeof qcReportSchema>;
