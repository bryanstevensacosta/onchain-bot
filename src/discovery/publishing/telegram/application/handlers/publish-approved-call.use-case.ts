import { Inject, Injectable, Logger } from '@nestjs/common';
import { ChainId } from 'shared/common/value-objects/chain-id.vo';
import { PublishedCall } from 'discovery/publishing/telegram/domain/entities/published-call.entity';
import {
  MessageFormatterPort,
  ApprovedCallInput,
} from 'discovery/publishing/telegram/domain/ports/message-formatter.port';
import { OutputChannelResolverPort } from 'discovery/publishing/telegram/domain/ports/output-channel-resolver.port';
import { TelegramPublisherPort } from 'discovery/publishing/telegram/domain/ports/telegram-publisher.port';
import { PublishedCallRepository } from 'discovery/publishing/telegram/application/ports/published-call.repository';
import { PublishingEventPublisher } from 'discovery/publishing/telegram/application/ports/publishing-event.publisher';
import {
  PublishedCallMapper,
  PublishedCallView,
} from 'discovery/publishing/telegram/application/mappers/published-call.mapper';
import { MESSAGE_FORMATTER } from 'discovery/publishing/telegram/publishing.tokens';

/**
 * Use case: publish an approved token call to all eligible Telegram
 * output channels.
 *
 * 1. Resolve target channels (filtered by score)
 * 2. Format message via MessageFormatterPort
 * 3. Send to each channel via TelegramPublisherPort (parallel)
 * 4. Aggregate results (succeeded vs failed)
 * 5. Persist PublishedCall + emit event
 *
 * `force=true` bypasses any dedup window (used by admin re-publish).
 */
@Injectable()
export class PublishApprovedCallUseCase {
  private readonly logger = new Logger(PublishApprovedCallUseCase.name);

  public constructor(
    @Inject(MESSAGE_FORMATTER) private readonly formatter: MessageFormatterPort,
    private readonly channelResolver: OutputChannelResolverPort,
    private readonly publisher: TelegramPublisherPort,
    private readonly callRepo: PublishedCallRepository,
    private readonly eventPublisher: PublishingEventPublisher,
  ) {}

  public async execute(input: ApprovedCallInput): Promise<PublishedCallView> {
    const chain = ChainId.fromString(input.chain);
    const channels = this.channelResolver.listForScore(input.score);
    if (channels.length === 0) {
      this.logger.warn(`No output channels for score ${input.score}`);
    }

    const message = this.formatter.format(input);

    const sendResults = await Promise.allSettled(
      channels.map((c) => this.publisher.sendMessage(c.channelId, message)),
    );

    const published: string[] = [];
    const failed: string[] = [];
    sendResults.forEach((r, i) => {
      const channel = channels[i];
      if (r.status === 'fulfilled' && r.value.ok) {
        published.push(channel.channelId);
      } else {
        failed.push(channel.channelId);
      }
    });

    const call = PublishedCall.create(
      {
        chain,
        address: input.address,
        ticker: input.ticker,
        score: input.score,
        tier:
          input.score >= 80
            ? 'STRONG'
            : input.score >= 60
              ? 'DECENT'
              : 'NEUTRAL',
        classification: input.classification,
        message,
        targetChannels: channels.map((c) => c.channelId),
      },
      { published, failed },
    );

    await this.callRepo.save(call);
    call.emit();
    await this.eventPublisher.publishAll(call.commit());

    return PublishedCallMapper.toView(call);
  }
}
