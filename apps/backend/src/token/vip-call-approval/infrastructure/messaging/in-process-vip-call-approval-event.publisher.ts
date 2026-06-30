import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DomainEvent } from 'shared/kernel/domain-event';
import { VipCallApprovalEventPublisher } from 'token/vip-call-approval/application/ports/vip-call-approval-event.publisher';

@Injectable()
export class InProcessVipCallApprovalEventPublisher extends VipCallApprovalEventPublisher {
  private readonly logger = new Logger(InProcessVipCallApprovalEventPublisher.name);

  public constructor(private readonly eventEmitter: EventEmitter2) {
    super();
  }

  public async publish(event: DomainEvent): Promise<void> {
    this.logger.debug(
      `event=${event.eventName} aggregateId=${event.aggregateId}`,
    );
    await Promise.resolve(this.eventEmitter.emit(event.eventName, event));
  }
}
