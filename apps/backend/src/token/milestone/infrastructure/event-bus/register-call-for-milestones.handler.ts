import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { RegisterCallForMilestonesEvent } from '../../domain/events/register-call-for-milestones.event';
import { RegisterMonitoredCallUseCase } from '../../application/handlers/register-monitored-call.use-case';

@Injectable()
export class RegisterCallForMilestonesHandler {
  private readonly logger = new Logger(RegisterCallForMilestonesHandler.name);

  constructor(private readonly useCase: RegisterMonitoredCallUseCase) {}

  @OnEvent(RegisterCallForMilestonesEvent.EVENT_NAME, { async: true })
  async handle(event: RegisterCallForMilestonesEvent): Promise<void> {
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
