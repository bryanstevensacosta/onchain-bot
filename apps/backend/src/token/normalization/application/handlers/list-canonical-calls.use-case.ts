/**
 * @deprecated Moved to apps/kol-calls/src/normalization/ (Tramo 1, todo 7 + P18 companion).
 * Normalization as mention-index now lives in kol-calls: NormalizeCallUseCase →
 * (contract, kol, messageId) index WITHOUT collapse ("one card per coin" explicitly
 * derogated per P1). This file stays wired for dual-run; it will be removed in
 * todo 16 (cutover + cleanup). Do not extend it — add normalization logic in
 * apps/kol-calls/src/normalization/ instead.
 *
 * New location: apps/kol-calls/src/normalization/
 * Reason: extracting KOL pipeline from backend monolith to dedicated app
 * Breaking change: Yes (removal in todo 16)
 * Rollback: re-enable backend path (KOL_PIPELINE_ENABLED=true)
 */
import { Injectable, Logger } from '@nestjs/common';
import { DomainError, ErrorCode } from 'shared/kernel/domain-error';
import { CanonicalTokenCallRepository } from 'token/normalization/application/ports/canonical-token-call.repository';
import {
  CanonicalTokenCallMapper,
  CanonicalTokenCallView,
} from 'token/normalization/application/mappers/canonical-token-call.mapper';

@Injectable()
export class ListCanonicalCallsUseCase {
  private readonly logger = new Logger(ListCanonicalCallsUseCase.name);

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
    const result: CanonicalTokenCallView[] = [];
    for (const c of calls) {
      try {
        result.push(CanonicalTokenCallMapper.toView(c));
      } catch (err) {
        this.logger.warn(
          `Skipping invalid canonical token ${c.identity.chain.value}:${c.identity.address.value}: ${(err as Error).message}`,
        );
      }
    }
    return result;
  }
}
