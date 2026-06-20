import { Injectable } from '@nestjs/common';
import { DomainError, ErrorCode } from 'shared/kernel/domain-error';
import { CanonicalTokenCallRepository } from 'discovery/normalization/application/ports/canonical-token-call.repository';
import {
  CanonicalTokenCallMapper,
  CanonicalTokenCallView,
} from 'discovery/normalization/application/mappers/canonical-token-call.mapper';

@Injectable()
export class ListCanonicalCallsUseCase {
  public constructor(private readonly callRepo: CanonicalTokenCallRepository) {}

  public async execute(
    limit: number,
  ): Promise<ReadonlyArray<CanonicalTokenCallView>> {
    if (!Number.isInteger(limit) || limit <= 0 || limit > 500) {
      throw new DomainError(ErrorCode.VALIDATION, `Invalid limit: ${limit}`, {
        limit,
      });
    }
    const calls = await this.callRepo.findRecent(limit);
    return calls.map((c) => CanonicalTokenCallMapper.toView(c));
  }
}
