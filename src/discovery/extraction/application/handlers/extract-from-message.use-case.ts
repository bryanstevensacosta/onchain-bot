import { Injectable } from '@nestjs/common';
import { ExtractorPort } from 'discovery/extraction/domain/ports/extractor.port';
import { ExtractionResult } from 'discovery/extraction/domain/entities/extraction-result.entity';
import { ExtractionResultRepository } from 'discovery/extraction/application/ports/extraction-result.repository';
import { ExtractionEventPublisher } from 'discovery/extraction/application/ports/extraction-event.publisher';
import {
  ExtractionResultMapper,
  ExtractionResultView,
} from 'discovery/extraction/application/mappers/extraction-result.mapper';

export interface ExtractFromMessageInput {
  readonly channelId: string;
  readonly messageId: number;
  readonly occurredAt: Date;
  readonly text: string;
}

/**
 * Use case: extract candidates (CAs, tickers, URLs) from a single message
 * and persist + publish the result for downstream BCs.
 */
@Injectable()
export class ExtractFromMessageUseCase {
  public constructor(
    private readonly extractor: ExtractorPort,
    private readonly resultRepo: ExtractionResultRepository,
    private readonly eventPublisher: ExtractionEventPublisher,
  ) {}

  public async execute(
    input: ExtractFromMessageInput,
  ): Promise<ExtractionResultView> {
    const candidates = await this.extractor.extract(input);

    const result = ExtractionResult.create({
      channelId: input.channelId,
      messageId: input.messageId,
      occurredAt: input.occurredAt,
      rawText: input.text,
      contractAddresses: candidates.contractAddresses,
      tickers: candidates.tickers,
      urls: candidates.urls,
    });

    await this.resultRepo.save(result);

    result.emitCandidatesExtracted();
    await this.eventPublisher.publishAll(result.commit());

    return ExtractionResultMapper.toView(result);
  }
}
