import type { Database } from '@kadence/db';
import type { StockProvider } from '@kadence/contracts';
import type { ObjectStorage } from '@kadence/storage';
import type { Logger } from 'pino';

export interface StageDeps<TEnv> {
  db: Database;
  storage: ObjectStorage;
  env: TEnv;
  logger: Logger;
  /** Optional so queues that do not need stock can run without Pixabay. */
  stockProvider?: StockProvider;
}
