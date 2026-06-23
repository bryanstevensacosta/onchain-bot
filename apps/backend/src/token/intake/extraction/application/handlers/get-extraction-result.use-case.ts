import { Injectable } from '@nestjs/common';
import { DomainError, ErrorCode } from 'shared/kernel/domain-error';
import { ExtractionResultRepository } from 'token/intake/extraction/application/ports/extraction-result.repository';
import {
  ExtractionResultMapper,
  ExtractionResultView,
} from 'token/intake/extraction/application/mappers/extraction-result.mapper';

/**
 * Use case: read a single extraction result by channel + message id.
 */
@Injectable()
export class GetExtractionResultUseCase {
  public constructor(private readonly resultRepo: ExtractionResultRepository) {}

  public async execute(
    kolId: string,
    messageId: number,
  ): Promise<ExtractionResultView> {
    const result = await this.resultRepo.findByChannelAndMessage(
      kolId,
      messageId,
    );
    if (!result) {
      throw new DomainError(
        ErrorCode.NOT_FOUND,
        `Extraction result not found: ${kolId}:${messageId}`,
        { kolId, messageId },
      );
    }
    return ExtractionResultMapper.toView(result);
  }
}
