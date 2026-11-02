import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { sql } from 'drizzle-orm';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import type { AppEnv } from '../config/env.js';
import * as schema from '../db/schema.js';

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name);
  private readonly pool: Pool;

  readonly db: NodePgDatabase<typeof schema>;

  constructor(config: ConfigService<AppEnv, true>) {
    this.pool = new Pool({
      connectionString: config.get('DATABASE_URL', { infer: true }),
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 3_000,
    });

    this.db = drizzle(this.pool, { schema });

    this.pool.on('error', (error: Error) => {
      this.logger.error({ err: error }, 'Unexpected PostgreSQL pool error');
    });
  }

  async ping(): Promise<boolean> {
    try {
      await this.db.execute(sql`select 1`);
      return true;
    } catch (error: unknown) {
      this.logger.warn({ err: error }, 'PostgreSQL ping failed');
      return false;
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }
}
