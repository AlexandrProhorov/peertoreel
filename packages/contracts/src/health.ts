import { z } from 'zod';

export const healthCheckStatusSchema = z.enum(['up', 'down']);
export type HealthCheckStatus = z.infer<typeof healthCheckStatusSchema>;

export const livenessResponseSchema = z.object({
  status: z.literal('ok'),
  service: z.literal('api'),
  version: z.string().min(1),
  uptimeSeconds: z.number().nonnegative(),
  timestamp: z.iso.datetime(),
});

export const readinessResponseSchema = z.object({
  status: z.enum(['ok', 'degraded']),
  service: z.literal('api'),
  version: z.string().min(1),
  uptimeSeconds: z.number().nonnegative(),
  timestamp: z.iso.datetime(),
  checks: z.object({
    database: healthCheckStatusSchema,
    redis: healthCheckStatusSchema,
    worker: healthCheckStatusSchema,
  }),
});

export type LivenessResponse = z.infer<typeof livenessResponseSchema>;
export type ReadinessResponse = z.infer<typeof readinessResponseSchema>;
