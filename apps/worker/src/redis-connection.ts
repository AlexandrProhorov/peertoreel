import type { ConnectionOptions } from 'bullmq';

export function redisConnectionOptions(rawUrl: string): ConnectionOptions {
  const url = new URL(rawUrl);
  const database = url.pathname.replace(/^\//, '');

  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    username: url.username || undefined,
    password: url.password || undefined,
    db: database.length > 0 ? Number(database) : undefined,
    maxRetriesPerRequest: null,
  };
}
