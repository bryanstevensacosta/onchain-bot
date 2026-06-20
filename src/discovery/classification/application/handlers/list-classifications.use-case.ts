import { Injectable } from '@nestjs/common';
import { DomainError, ErrorCode } from 'shared/kernel/domain-error';
import { TokenClassificationRepository } from 'discovery/classification/application/ports/token-classification.repository';
import {
  TokenClassificationMapper,
  TokenClassificationView,
} from 'discovery/classification/application/mappers/token-classification.mapper';

@Injectable()
export class ListClassificationsUseCase {
  public constructor(private readonly repo: TokenClassificationRepository) {}

  public async execute(
    limit: number,
  ): Promise<ReadonlyArray<TokenClassificationView>> {
    if (!Number.isInteger(limit) || limit <= 0 || limit > 500) {
      throw new DomainError(ErrorCode.VALIDATION, `Invalid limit: ${limit}`, {
        limit,
      });
    }
    const items = await this.repo.findRecent(limit);
    return items.map((c) => TokenClassificationMapper.toView(c));
  }
}
