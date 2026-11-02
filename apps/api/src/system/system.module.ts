import { Module } from '@nestjs/common';
import { SystemController } from './system.controller.js';
import { SystemQueue } from './system.queue.js';

@Module({
  controllers: [SystemController],
  providers: [SystemQueue],
})
export class SystemModule {}
