import { Controller, Post, Body, Logger, Get } from '@nestjs/common';
import { TelegramMockAdapter } from 'telegram/ingestion/shared/infrastructure/adapters/telegram-mock.adapter';

interface InjectMessageDto {
  peerId: string;
  messageId: number;
  text: string;
  occurredAt: string;
  media?: any[];
  entities?: any[];
  groupedId?: string | null;
}

/**
 * Development-only controller for mock ingestion
 * Only available when USE_MOCK_INGESTION=true
 */
@Controller('dev')
export class DevController {
  private readonly logger = new Logger(DevController.name);

  constructor(private readonly mockAdapter: TelegramMockAdapter) {}

  @Post('inject-message')
  async injectMessage(@Body() dto: InjectMessageDto) {
    this.logger.log(`Injecting message: ${dto.peerId}/${dto.messageId}`);

    this.mockAdapter.injectMessage({
      peerId: dto.peerId,
      messageId: dto.messageId,
      text: dto.text,
      occurredAt: new Date(dto.occurredAt),
      media: dto.media ?? [],
      entities: dto.entities ?? [],
      groupedId: dto.groupedId ?? undefined,
    });

    return {
      success: true,
      message: 'Message injected into mock adapter queue',
      queueSize: this.mockAdapter.getQueueSize(),
    };
  }

  @Get('queue-status')
  async getQueueStatus() {
    return {
      queueSize: this.mockAdapter.getQueueSize(),
    };
  }

  @Post('clear-queue')
  async clearQueue() {
    this.mockAdapter.clearQueue();
    return {
      success: true,
      message: 'Queue cleared',
    };
  }
}
