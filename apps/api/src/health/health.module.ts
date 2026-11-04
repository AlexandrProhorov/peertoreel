import { Module } from '@nestjs/common';
import { SystemModule } from '../system/system.module.js';
import { HealthController } from './health.controller.js';
import { HealthService } from './health.service.js';

@Module({
  imports: [SystemModule],
  controllers: [HealthController],
  providers: [HealthService],
})
export class HealthModule {}
