import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { ArtifactsRepository } from './artifacts.repository.js';
import { RunsController } from './runs.controller.js';
import { RunsRepository } from './runs.repository.js';
import { RunsService } from './runs.service.js';

@Module({
  imports: [AuthModule],
  controllers: [RunsController],
  providers: [RunsService, RunsRepository, ArtifactsRepository],
})
export class RunsModule {}
