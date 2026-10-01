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
import { TokenCall } from 'token/intake/parsing/domain/entities/token-call.entity';

/**
 * Outbound port: persistence for parsed TokenCalls.
 */
export abstract class TokenCallRepository {
  public abstract save(call: TokenCall): Promise<void>;
  public abstract findByChannelAndMessage(
    kolId: string,
    messageId: number,
  ): Promise<TokenCall | null>;
  public abstract findRecent(limit: number): Promise<ReadonlyArray<TokenCall>>;
}
