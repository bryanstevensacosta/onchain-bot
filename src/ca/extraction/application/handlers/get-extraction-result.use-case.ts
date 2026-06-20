import { Injectable } from '@nestjs/common';
import { DomainError, ErrorCode } from 'shared/kernel/domain-error';
import { ExtractionResultRepository } from 'ca/extraction/application/ports/extraction-result.repository';
import {
  ExtractionResultMapper,
  ExtractionResultView,
} from 'ca/extraction/application/mappers/extraction-result.mapper';

/**
 * Use case: read a single extraction result by channel + message id.
 */
@Injectable()
export class GetExtractionResultUseCase {
  public constructor(private readonly resultRepo: ExtractionResultRepository) {}

  public async execute(
    channelId: string,
    messageId: number,
  ): Promise<ExtractionResultView> {
    const result = await this.resultRepo.findByChannelAndMessage(
      channelId,
      messageId,
    );
    if (!result) {
      throw new DomainError(
        ErrorCode.NOT_FOUND,
        `Extraction result not found: ${channelId}:${messageId}`,
        { channelId, messageId },
      );
    }
    return ExtractionResultMapper.toView(result);
  }
}
