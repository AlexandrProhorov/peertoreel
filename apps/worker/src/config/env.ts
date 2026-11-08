import { z } from 'zod';
import { parseTokenKey } from '@peertoreel/tiktok';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  REDIS_URL: z.string().min(1).default('redis://localhost:6379'),
  WORKER_CONCURRENCY: z.coerce.number().int().positive().max(10).default(1),
  DATABASE_URL: z
    .string()
    .min(1)
    .default('postgresql://peertoreel:peertoreel@localhost:5432/peertoreel'),
  S3_ENDPOINT: z.string().min(1).default('http://localhost:8333'),
  S3_REGION: z.string().min(1).default('us-east-1'),
  S3_BUCKET: z.string().min(1).default('peertoreel'),
  S3_ACCESS_KEY: z.string().min(1).default('peertoreel'),
  S3_SECRET_KEY: z.string().min(1).default('peertoreel-dev-secret'),
  S3_FORCE_PATH_STYLE: z
    .enum(['true', 'false'])
    .default('true')
    .transform((value) => value === 'true'),
  FFMPEG_BIN: z.string().min(1).default('ffmpeg'),
  FFPROBE_BIN: z.string().min(1).default('ffprobe'),
  // Provider keys are optional at boot so the worker can run queues that do not
  // need them; each stage fails with a clear message when its key is missing.
  DEEPSEEK_API_KEY: z.string().min(1).optional(),
  LLM_BASE_URL: z.string().min(1).default('https://api.deepseek.com'),
  LLM_MODEL: z.string().min(1).default('deepseek-flash'),
  ELEVENLABS_API_KEY: z.string().min(1).optional(),
  ELEVENLABS_VOICE_ID: z.string().min(1).optional(),
  ELEVENLABS_MODEL_ID: z.string().min(1).default('eleven_multilingual_v2'),
  PIXABAY_API_KEY: z.string().min(1).optional(),
  // M1.2a spike: required only for the TikTok upload script, not at boot.
  TIKTOK_CLIENT_KEY: z.string().min(1).optional(),
  TIKTOK_CLIENT_SECRET: z.string().min(1).optional(),
  TIKTOK_REDIRECT_URI: z.string().min(1).optional(),
  TOKEN_ENCRYPTION_KEY: z
    .string()
    .min(1)
    .refine(
      (value) => {
        try {
          parseTokenKey(value);
          return true;
        } catch {
          return false;
        }
      },
      'TOKEN_ENCRYPTION_KEY must be 32 bytes (base64 or 64 hex characters)',
    )
    .optional(),
});

export type WorkerEnv = z.infer<typeof envSchema>;

export function loadWorkerEnv(source: NodeJS.ProcessEnv = process.env): WorkerEnv {
  const result = envSchema.safeParse(source);

  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `${issue.path.join('.') || 'env'}: ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid worker environment: ${details}`);
  }

  return result.data;
}

export function requireProviderKey(
  value: string | undefined,
  name: string,
): string {
  if (!value) {
    throw new Error(`${name} не задан в .env — стадия не может обратиться к провайдеру`);
  }

  return value;
}
