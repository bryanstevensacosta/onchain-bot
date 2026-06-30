import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { RegisterCallForAchievementsEvent } from '../../domain/events/register-call-for-milestones.event';
import { RegisterMonitoredCallUseCase } from '../../application/handlers/register-monitored-call.use-case';

@Injectable()
export class RegisterCallForAchievementsHandler {
  private readonly logger = new Logger(RegisterCallForAchievementsHandler.name);

  constructor(private readonly useCase: RegisterMonitoredCallUseCase) {}

  @OnEvent(RegisterCallForAchievementsEvent.EVENT_NAME, { async: true })
  async handle(event: RegisterCallForAchievementsEvent): Promise<void> {
    try {
      await this.useCase.execute({
        callId: event.payload.callId,
        chain: event.payload.chain,
        address: event.payload.address,
        mcAtCall: event.payload.mcAtCall,
        publishedAt: new Date(event.payload.publishedAt),
      });
    } catch (err) {
      this.logger.warn(
        `Failed to register call for milestones (callId=${event.payload.callId}): ${(err as Error).message}`,
      );
    }
  }
}
