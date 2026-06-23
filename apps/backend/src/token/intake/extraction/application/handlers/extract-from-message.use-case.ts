import { Injectable } from '@nestjs/common';
import { ExtractorPort } from 'token/intake/extraction/domain/ports/extractor.port';
import { ExtractionResult } from 'token/intake/extraction/domain/entities/extraction-result.entity';
import { ExtractionResultRepository } from 'token/intake/extraction/application/ports/extraction-result.repository';
import { ExtractionEventPublisher } from 'token/intake/extraction/application/ports/extraction-event.publisher';
import {
  ExtractionResultMapper,
  ExtractionResultView,
} from 'token/intake/extraction/application/mappers/extraction-result.mapper';

export interface ExtractFromMessageInput {
  readonly kolId: string;
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
      kolId: input.kolId,
      messageId: input.messageId,
      occurredAt: input.occurredAt,
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
