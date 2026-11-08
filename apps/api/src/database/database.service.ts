import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createDatabase, type Database } from '@peertoreel/db';
import { sql } from 'drizzle-orm';
import type { Pool } from 'pg';
import type { AppEnv } from '../config/env.js';

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name);
  private readonly pool: Pool;

  readonly db: Database;

  constructor(config: ConfigService<AppEnv, true>) {
    const handle = createDatabase(config.get('DATABASE_URL', { infer: true }));

    this.pool = handle.pool;
    this.db = handle.db;

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
