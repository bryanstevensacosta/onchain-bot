import { Module } from '@nestjs/common';
import { VipCallApprovedHandler } from './infrastructure/event-bus/vip-call-approved.handler';
import { VipCallRejectedHandler } from './infrastructure/event-bus/vip-call-rejected.handler';

@Module({
  providers: [VipCallApprovedHandler, VipCallRejectedHandler],
  exports: [],
})
export class VipDecisionsModule {}
