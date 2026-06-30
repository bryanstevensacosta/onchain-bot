import { Inject, Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { CallAchievementReachedEvent } from 'token/achievement/domain/events/call-achievement-reached.event';
import { NotifiedAchievementRepository } from 'token/achievement/application/ports/notified-achievement.repository';
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
    @Inject(NotifiedAchievementRepository)
    private readonly notifiedRepo: NotifiedAchievementRepository,
  ) {}

  @OnEvent(CallAchievementReachedEvent.EVENT_NAME, { async: true })
  async handle(event: CallAchievementReachedEvent): Promise<void> {
    const { callId, chain, address, multiple, mcAtCall, mcNow } = event.payload;
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
          `Telegram send failed for achievement ${multiple}x callId=${callId}: ${result.error ?? 'unknown'}`,
        );
        return;
      }
      if (result.messageId != null) {
        await this.notifiedRepo.updateTelegramMessageId(
          callId,
          multiple,
          result.messageId,
        );
      }
    } catch (err) {
      this.logger.warn(
        `Achievement consumer failed for ${multiple}x callId=${callId}: ${(err as Error).message}`,
      );
    }
  }
}
