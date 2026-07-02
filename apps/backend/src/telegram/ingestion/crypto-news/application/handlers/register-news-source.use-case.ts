import { Injectable } from '@nestjs/common';
import { DomainError, ErrorCode } from 'shared/kernel/domain-error';
import { CryptoNewsSource } from 'telegram/ingestion/crypto-news/domain/entities/crypto-news-source.entity';
import { CryptoNewsSourceRepository } from 'telegram/ingestion/crypto-news/application/ports/crypto-news-source.repository';
import { CryptoNewsEventPublisher } from 'telegram/ingestion/crypto-news/application/ports/crypto-news-event.publisher';

export interface RegisterNewsSourceInput {
  readonly channelId: string;
  readonly handle: string | null;
  readonly title: string;
}

/**
 * Use case: register a new Telegram channel as a crypto-news source.
 *
 * Throws CONFLICT if the channelId is already registered.
 * Publishes CryptoNewsSourceSeededEvent on success.
 */
@Injectable()
export class RegisterNewsSourceUseCase {
  constructor(
    private readonly sourceRepo: CryptoNewsSourceRepository,
    private readonly eventPublisher: CryptoNewsEventPublisher,
  ) {}

  public async execute(
    input: RegisterNewsSourceInput,
  ): Promise<CryptoNewsSource> {
    const existing = await this.sourceRepo.findByChannelId(input.channelId);
    if (existing) {
      throw new DomainError(
        ErrorCode.CONFLICT,
        `CryptoNewsSource already registered: ${input.channelId}`,
        { channelId: input.channelId },
      );
    }

    const source = CryptoNewsSource.create({
      channelId: input.channelId,
      handle: input.handle,
      title: input.title,
    });

    await this.sourceRepo.save(source);
    await this.eventPublisher.publishAll(source.commit());
    return source;
  }
}
