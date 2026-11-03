import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema.js';

export type Database = NodePgDatabase<typeof schema>;

export interface DatabaseHandle {
  db: Database;
  pool: Pool;
}

/**
 * One connection pool per process. The Nest app owns shutdown via its module
 * lifecycle; the worker calls `pool.end()` on SIGINT/SIGTERM.
 */
export function createDatabase(connectionString: string): DatabaseHandle {
  const pool = new Pool({
    connectionString,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 3_000,
  });

  return { db: drizzle(pool, { schema }), pool };
}
