import { z } from 'zod';

export const systemJobStatusSchema = z.enum([
  'queued',
  'active',
  'completed',
  'failed',
]);
export type SystemJobStatus = z.infer<typeof systemJobStatusSchema>;

export const pingJobDataSchema = z.object({
  requestId: z.string().min(1),
  message: z.string().min(1).max(200).optional(),
});
export type PingJobData = z.infer<typeof pingJobDataSchema>;

export const pingJobResultSchema = z.object({
  requestId: z.string().min(1),
  processedAt: z.iso.datetime(),
  durationMs: z.number().nonnegative(),
});
export type PingJobResult = z.infer<typeof pingJobResultSchema>;

export const enqueuePingRequestSchema = z.object({
  requestId: z.string().min(1).optional(),
  message: z.string().min(1).max(200).optional(),
});
export type EnqueuePingRequest = z.infer<typeof enqueuePingRequestSchema>;

export const enqueuePingResponseSchema = z.object({
  jobId: z.string().min(1),
  status: z.literal('queued'),
});
export type EnqueuePingResponse = z.infer<typeof enqueuePingResponseSchema>;

export const systemJobSnapshotSchema = z.object({
  jobId: z.string().min(1),
  status: systemJobStatusSchema,
  progress: z.number().min(0).max(100),
  message: z.string().optional(),
  result: pingJobResultSchema.optional(),
  failedReason: z.string().optional(),
});
export type SystemJobSnapshot = z.infer<typeof systemJobSnapshotSchema>;
