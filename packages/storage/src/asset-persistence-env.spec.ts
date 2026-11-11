import { describe, expect, it } from 'vitest';
import { parseAssetPersistenceEnv } from './asset-persistence-env.js';

const COMPLETE = {
  DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
  S3_ENDPOINT: 'http://localhost:8333',
  S3_REGION: 'us-east-1',
  S3_BUCKET: 'peertoreel',
  S3_ACCESS_KEY: 'key',
  S3_SECRET_KEY: 'secret',
};

describe('parseAssetPersistenceEnv', () => {
  it('names the missing variables instead of silently falling back', () => {
    expect(() => parseAssetPersistenceEnv({})).toThrow(/DATABASE_URL/);
    expect(() =>
      parseAssetPersistenceEnv({ ...COMPLETE, S3_BUCKET: undefined }),
    ).toThrow(/S3_BUCKET/);
    expect(() => parseAssetPersistenceEnv({})).toThrow(/no silent in-memory/);
  });

  it('defaults path-style addressing to true and parses false', () => {
    expect(parseAssetPersistenceEnv(COMPLETE).S3_FORCE_PATH_STYLE).toBe(true);
    expect(
      parseAssetPersistenceEnv({ ...COMPLETE, S3_FORCE_PATH_STYLE: 'false' })
        .S3_FORCE_PATH_STYLE,
    ).toBe(false);
  });
});
