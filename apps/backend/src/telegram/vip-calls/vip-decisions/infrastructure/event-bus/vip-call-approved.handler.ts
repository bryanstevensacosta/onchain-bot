import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { VipCallApprovedEvent } from 'token/vip-call-approval/domain/events/vip-call-approved.event';

/**
 * Handles `vip-call.approval.approved` events by delegating the call flow.
 *
 * NOTE: This orchestrator is a thin listener — actual publishing happens in
 * `vip-channel` (via `VipCallPublishingPort`) and achievement registration
 * happens in `token/achievement` (via `RegisterMonitoredCallForAchievementsUseCase`).
 * This handler exists as the orchestrator layer so future cross-cutting concerns
 * (logging, metrics, multi-channel fanout coordination) have a stable home.
 */
@Injectable()
export class VipCallApprovedHandler {
  private readonly logger = new Logger(VipCallApprovedHandler.name);

  @OnEvent('vip-call.approval.approved', { async: true })
  public async handle(event: VipCallApprovedEvent): Promise<void> {
    this.logger.log(`VipCallApprovedEvent received: ${event.aggregateId}`);
  }
}
