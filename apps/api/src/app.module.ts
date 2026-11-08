import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_FILTER } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';
import { stdSerializers } from 'pino';
import type { IncomingMessage } from 'node:http';
import { randomUUID } from 'node:crypto';
import { TikTokModule } from './accounts/tiktok.module.js';
import { AuthModule } from './auth/auth.module.js';
import { ApiExceptionFilter } from './common/api-exception.filter.js';
import { AppConfigModule } from './config/config.module.js';
import type { AppEnv } from './config/env.js';
import { DatabaseModule } from './database/database.module.js';
import { HealthModule } from './health/health.module.js';
import { PublishModule } from './publish/publish.module.js';
import { RedisModule } from './redis/redis.module.js';
import { RunsModule } from './runs/runs.module.js';
import { StorageModule } from './storage/storage.module.js';
import { SystemModule } from './system/system.module.js';

@Module({
  imports: [
    AppConfigModule,
    LoggerModule.forRootAsync({
      imports: [AppConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppEnv, true>) => ({
        pinoHttp: {
          level: config.get('LOG_LEVEL', { infer: true }),
          genReqId: (request) => {
            const header = request.headers['x-request-id'];
            return typeof header === 'string' && header.length > 0
              ? header
              : randomUUID();
          },
          redact: {
            paths: [
              'req.headers.authorization',
              'req.headers.cookie',
              'res.headers["set-cookie"]',
            ],
            censor: '[REDACTED]',
          },
          serializers: {
            req: (request: IncomingMessage & { id?: string }) => {
              const serialized = stdSerializers.req(request);
              const url = serialized.url ?? '';

              // The OAuth callback query contains a one-time code and state;
              // hard rule 4 forbids full OAuth payloads in logs.
              if (url.startsWith('/api/v1/accounts/tiktok/callback')) {
                serialized.url = url.split('?')[0] ?? url;
              }

              return serialized;
            },
          },
        },
      }),
    }),
    DatabaseModule,
    RedisModule,
    StorageModule,
    AuthModule,
    TikTokModule,
    HealthModule,
    RunsModule,
    PublishModule,
    SystemModule,
  ],
  providers: [
    {
      provide: APP_FILTER,
      useClass: ApiExceptionFilter,
    },
  ],
})
export class AppModule {}

