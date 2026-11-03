import { Module } from '@nestjs/common';
import { SystemController } from './system.controller.js';
import { SystemEventsService } from './system-events.service.js';
import { SystemQueue } from './system.queue.js';

@Module({
  controllers: [SystemController],
  providers: [SystemQueue, SystemEventsService],
})
export class SystemModule {}
