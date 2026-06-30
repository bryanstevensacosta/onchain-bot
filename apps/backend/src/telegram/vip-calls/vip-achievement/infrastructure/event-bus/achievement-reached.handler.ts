import { Inject, Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { CallAchievementReachedEvent } from 'token/achievement/domain/events/call-achievement-reached.event';
import { MessageFormatterPort, TelegramPublisherPort } from 'telegram/shared';
import { VipCallsMessageFormatterAdapter } from '../../../vip-channel/infrastructure/formatters/vip-message-formatter.adapter';

@Injectable()
export class AchievementReachedHandler {
  private readonly logger = new Logger(AchievementReachedHandler.name);

  constructor(
    @Inject(MessageFormatterPort)
    private readonly formatter: VipCallsMessageFormatterAdapter,
    @Inject(TelegramPublisherPort)
    private readonly publisher: TelegramPublisherPort,
  ) {}

  @OnEvent(CallAchievementReachedEvent.EVENT_NAME, { async: true })
  async handle(event: CallAchievementReachedEvent): Promise<void> {
    const { chain, address, multiple, mcAtCall, mcNow } = event.payload;
    try {
      const message = this.formatter.formatMilestoneMessage({
        chain,
        address,
        multiple,
        mcAtCall,
        mcNow,
      });
      const result = await this.publisher.sendMessage('', message);
      if (!result.ok) {
        this.logger.warn(
          `Telegram send failed for achievement ${multiple}x callId=${event.payload.callId}: ${result.error ?? 'unknown'}`,
        );
      }
    } catch (err) {
      this.logger.warn(
        `Achievement consumer failed for ${multiple}x callId=${event.payload.callId}: ${(err as Error).message}`,
      );
    }
  }
}
