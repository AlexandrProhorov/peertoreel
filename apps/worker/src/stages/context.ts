import type { Database } from '@peertoreel/db';
import type { StockProvider } from '@peertoreel/contracts';
import type { ObjectStorage } from '@peertoreel/storage';
import type { Logger } from 'pino';
import type { TikTokRuntime } from '../tiktok/account.js';

export interface StageDeps<TEnv> {
  db: Database;
  storage: ObjectStorage;
  env: TEnv;
  logger: Logger;
  /** Optional so queues that do not need stock can run without Pixabay. */
  stockProvider?: StockProvider;
  /** Optional so queues that do not publish can run without TikTok keys. */
  tiktok?: TikTokRuntime;
}
