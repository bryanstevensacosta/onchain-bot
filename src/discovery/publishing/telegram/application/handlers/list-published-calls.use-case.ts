import { Injectable } from '@nestjs/common';
import { DomainError, ErrorCode } from 'shared/kernel/domain-error';
import { PublishedCallRepository } from 'discovery/publishing/telegram/application/ports/published-call.repository';
import {
  PublishedCallMapper,
  PublishedCallView,
} from 'discovery/publishing/telegram/application/mappers/published-call.mapper';

export type PublishedListKind = 'recent' | 'published' | 'failed';

@Injectable()
export class ListPublishedCallsUseCase {
  public constructor(private readonly callRepo: PublishedCallRepository) {}

  public async execute(
    kind: PublishedListKind,
    limit: number,
  ): Promise<ReadonlyArray<PublishedCallView>> {
    if (!Number.isInteger(limit) || limit <= 0 || limit > 500) {
      throw new DomainError(ErrorCode.VALIDATION, `Invalid limit: ${limit}`, {
        limit,
      });
    }
    const items =
      kind === 'published'
        ? await this.callRepo.findPublished(limit)
        : kind === 'failed'
          ? await this.callRepo.findFailed(limit)
          : await this.callRepo.findRecent(limit);
    return items.map((c) => PublishedCallMapper.toView(c));
  }
}
