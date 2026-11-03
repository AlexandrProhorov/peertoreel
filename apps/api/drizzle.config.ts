import { config as loadEnv } from 'dotenv';
import { defineConfig } from 'drizzle-kit';

loadEnv({ path: '../../.env', quiet: true });

export default defineConfig({
  schema: '../../packages/db/src/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url:
      process.env['DATABASE_URL'] ??
      'postgresql://kadence:kadence@localhost:5432/kadence',
  },
  strict: true,
  verbose: true,
});
