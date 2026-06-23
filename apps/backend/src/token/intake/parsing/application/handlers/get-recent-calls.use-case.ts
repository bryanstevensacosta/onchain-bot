import { Injectable } from '@nestjs/common';
import { DomainError, ErrorCode } from 'shared/kernel/domain-error';
import { TokenCallRepository } from 'token/intake/parsing/application/ports/token-call.repository';
import {
  TokenCallMapper,
  TokenCallView,
} from 'token/intake/parsing/application/mappers/token-call.mapper';

@Injectable()
export class GetRecentCallsUseCase {
  public constructor(private readonly callRepo: TokenCallRepository) {}

  public async execute(limit: number): Promise<ReadonlyArray<TokenCallView>> {
    if (!Number.isInteger(limit) || limit <= 0 || limit > 500) {
      throw new DomainError(ErrorCode.VALIDATION, `Invalid limit: ${limit}`, {
        limit,
      });
    }
    const calls = await this.callRepo.findRecent(limit);
    return calls.map((c) => TokenCallMapper.toView(c));
  }
}
