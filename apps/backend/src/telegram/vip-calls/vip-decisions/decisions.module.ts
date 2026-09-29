/**
 * @deprecated Tramo 1 cutover (task-16, staging): approval decisions moved
 * to apps/kol-calls-publisher/src/approval (per-template bouncer).
 * Refactor target: delete this module at the central FINAL REVIEW (C4-bis.3).
 * Rollback: backend path stays wired; nothing deleted here.
 */
import { Module } from '@nestjs/common';
import { VipCallApprovedHandler } from './infrastructure/event-bus/vip-call-approved.handler';
import { VipCallRejectedHandler } from './infrastructure/event-bus/vip-call-rejected.handler';

@Module({
  providers: [VipCallApprovedHandler, VipCallRejectedHandler],
  exports: [],
})
export class VipDecisionsModule {}
