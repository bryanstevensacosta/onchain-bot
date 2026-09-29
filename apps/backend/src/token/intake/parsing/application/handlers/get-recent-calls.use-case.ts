/**
 * @deprecated Moved to apps/kol-calls/src/parsing/ (Tramo 1, todo 6 + P18 companion).
 * Parsing 1:1 now lives in kol-calls: ParseFromCandidatesUseCase → ParsedCall
 * (preserves mentions, NO collapse-to-one). This file stays wired for dual-run;
 * it will be removed in todo 16 (cutover + cleanup). Do not extend it — add parsing
 * logic in apps/kol-calls/src/parsing/ instead.
 *
 * New location: apps/kol-calls/src/parsing/
 * Reason: extracting KOL pipeline from backend monolith to dedicated app
 * Breaking change: Yes (removal in todo 16)
 * Rollback: re-enable backend path (KOL_PIPELINE_ENABLED=true)
 */
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
