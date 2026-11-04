import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { SystemController } from './system.controller.js';
import { SystemEventsService } from './system-events.service.js';
import { SystemQueue } from './system.queue.js';

@Module({
  imports: [AuthModule],
  controllers: [SystemController],
  providers: [SystemQueue, SystemEventsService],
  exports: [SystemQueue],
})
export class SystemModule {}
