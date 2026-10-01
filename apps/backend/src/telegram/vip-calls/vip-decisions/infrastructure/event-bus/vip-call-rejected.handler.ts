/**
 * @deprecated Moved to apps/kol-calls-publisher/src/telegram/ (+ templates orchestration in
 * apps/kol-calls-publisher/src/templates/, seed `vip-calls`) (Tramo 1, todo 11 + P18 companion).
 * P14: `vip-calls` is a template SEED name, never a module. This backend legacy copy stays
 * wired for dual-run; removed at central FINAL REVIEW. Do not extend.
 */
import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { VipCallRejectedEvent } from 'token/vip-call-approval/domain/events/vip-call-rejected.event';

@Injectable()
export class VipCallRejectedHandler {
  private readonly logger = new Logger(VipCallRejectedHandler.name);

  @OnEvent('vip-call.approval.rejected', { async: true })
  public async handle(event: VipCallRejectedEvent): Promise<void> {
    this.logger.log(`VipCallRejectedEvent received: ${event.aggregateId}`);
  }
}
