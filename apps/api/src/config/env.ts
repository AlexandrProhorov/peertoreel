import { z } from 'zod';

function emptyToUndefined(value: unknown): unknown {
  return typeof value === 'string' && value.trim() === '' ? undefined : value;
}

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().max(65_535).default(3000),
  APP_VERSION: z.string().min(1).default('0.1.0'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  CORS_ORIGIN: z.string().min(1).default('http://localhost:4200'),
  DATABASE_URL: z
    .string()
    .min(1)
    .default('postgresql://kadence:kadence@localhost:5432/kadence'),
  REDIS_URL: z.string().min(1).default('redis://localhost:6379'),
  SESSION_TTL_HOURS: z.coerce.number().int().min(1).max(24 * 365).default(168),
  BOOTSTRAP_ADMIN_EMAIL: z.preprocess(emptyToUndefined, z.email().optional()),
  BOOTSTRAP_ADMIN_PASSWORD: z.preprocess(
    emptyToUndefined,
    z.string().min(8).max(200).optional(),
  ),
});

export type AppEnv = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): AppEnv {
  const result = envSchema.safeParse(config);

  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `${issue.path.join('.') || 'env'}: ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid environment configuration: ${details}`);
  }

  return result.data;
}
