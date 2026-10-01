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
export class GetTokenCallUseCase {
  public constructor(private readonly callRepo: TokenCallRepository) {}

  public async execute(
    kolId: string,
    messageId: number,
  ): Promise<TokenCallView> {
    const call = await this.callRepo.findByChannelAndMessage(kolId, messageId);
    if (!call) {
      throw new DomainError(
        ErrorCode.NO_PARSED_CALL,
        `TokenCall not found: ${kolId}:${messageId}`,
        { kolId, messageId },
      );
    }
    return TokenCallMapper.toView(call);
  }
}
