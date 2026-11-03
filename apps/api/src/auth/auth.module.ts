import { Module } from '@nestjs/common';
import { AdminBootstrapService } from './admin-bootstrap.service.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { PasswordService } from './password.service.js';
import { SessionAuthGuard } from './session-auth.guard.js';
import { SessionsRepository } from './sessions.repository.js';
import { UsersRepository } from './users.repository.js';

@Module({
  controllers: [AuthController],
  providers: [
    AuthService,
    PasswordService,
    SessionAuthGuard,
    SessionsRepository,
    UsersRepository,
    AdminBootstrapService,
  ],
  exports: [AuthService, SessionAuthGuard],
})
export class AuthModule {}
