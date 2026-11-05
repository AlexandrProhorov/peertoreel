import type { StockAsset } from '@kadence/contracts';
import { stockAssetSchema } from '@kadence/contracts';
import type { Redis } from 'ioredis';
import { z } from 'zod';

export interface StockSearchCache {
  get(key: string): Promise<StockAsset[] | null>;
  set(key: string, assets: StockAsset[], ttlSec: number): Promise<void>;
}

const cachedAssetsSchema = z.array(stockAssetSchema);

/**
 * Search cache is an optimisation, not a dependency: a Redis failure must not
 * fail the visuals stage. A malformed entry is treated as a miss.
 */
export class RedisStockSearchCache implements StockSearchCache {
  constructor(private readonly redis: Redis) {}

  async get(key: string): Promise<StockAsset[] | null> {
    try {
      const raw = await this.redis.get(key);

      if (!raw) {
        return null;
      }

      const parsed = cachedAssetsSchema.safeParse(JSON.parse(raw));

      return parsed.success ? parsed.data : null;
    } catch {
      return null;
    }
  }

  async set(key: string, assets: StockAsset[], ttlSec: number): Promise<void> {
    try {
      await this.redis.set(key, JSON.stringify(assets), 'EX', ttlSec);
    } catch {
      // Cache writes are best-effort.
    }
  }
}
