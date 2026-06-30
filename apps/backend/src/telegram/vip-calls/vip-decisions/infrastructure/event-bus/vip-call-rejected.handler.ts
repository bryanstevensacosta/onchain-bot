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