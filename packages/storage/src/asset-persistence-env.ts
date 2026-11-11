import { z } from 'zod';

/**
 * Environment required to persist the Asset Library (M3.6a.1).
 *
 * One schema for every entry point (`assets:import`, `render-storyboard
 * --persist`) so the same missing variable produces the same error. Kept in
 * `@peertoreel/storage` because both apps already depend on it and neither
 * should hand-roll a slightly different `S3_*` contract.
 */
export const assetPersistenceEnvSchema = z.object({
  DATABASE_URL: z.string().min(1),
  S3_ENDPOINT: z.string().min(1),
  S3_REGION: z.string().min(1),
  S3_BUCKET: z.string().min(1),
  S3_ACCESS_KEY: z.string().min(1),
  S3_SECRET_KEY: z.string().min(1),
  S3_FORCE_PATH_STYLE: z
    .enum(['true', 'false'])
    .default('true')
    .transform((value) => value === 'true'),
});

export type AssetPersistenceEnv = z.infer<typeof assetPersistenceEnvSchema>;

export function parseAssetPersistenceEnv(
  source: NodeJS.ProcessEnv,
): AssetPersistenceEnv {
  const result = assetPersistenceEnvSchema.safeParse(source);

  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `${issue.path.join('.') || 'env'}: ${issue.message}`)
      .join('; ');

    throw new Error(
      `Asset persistence needs a complete environment (${details}). Set DATABASE_URL and S3_* in .env — there is no silent in-memory fallback.`,
    );
  }

  return result.data;
}
