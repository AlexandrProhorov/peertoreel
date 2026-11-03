import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppEnv } from '../config/env.js';
import { PasswordService } from './password.service.js';
import { SessionsRepository } from './sessions.repository.js';
import { UsersRepository } from './users.repository.js';

/**
 * Creates the first admin from `BOOTSTRAP_ADMIN_*` when the `users` table is
 * empty. Idempotent: once any user exists the env values are ignored.
 */
@Injectable()
export class AdminBootstrapService implements OnApplicationBootstrap {
  private readonly logger = new Logger(AdminBootstrapService.name);

  constructor(
    private readonly config: ConfigService<AppEnv, true>,
    private readonly users: UsersRepository,
    private readonly sessions: SessionsRepository,
    private readonly passwords: PasswordService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const email = this.config.get('BOOTSTRAP_ADMIN_EMAIL', { infer: true });
    const password = this.config.get('BOOTSTRAP_ADMIN_PASSWORD', {
      infer: true,
    });

    if (!email || !password) {
      return;
    }

    try {
      await this.sessions.deleteExpired(new Date());

      if ((await this.users.countAll()) > 0) {
        return;
      }

      const user = await this.users.create({
        email,
        displayName: 'Owner',
        passwordHash: await this.passwords.hash(password),
        role: 'admin',
      });

      this.logger.log(`Bootstrap admin created: ${user.email}`);
    } catch (error: unknown) {
      this.logger.error({ err: error }, 'Admin bootstrap failed');
    }
  }
}
