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
import { CanonicalTokenCall } from 'token/normalization/domain/entities/canonical-token-call.entity';
import { ChainFamily } from 'chain/identity/chain-family.vo';
import { NormalizedAddress } from 'token/identity/normalized-address.vo';

/**
 * Outbound port: persistence for canonical token calls.
 *
 * Indexed by `(chain, address)` composite identity.
 */
export abstract class CanonicalTokenCallRepository {
  public abstract save(call: CanonicalTokenCall): Promise<void>;
  public abstract findByIdentity(
    chain: ChainFamily,
    address: NormalizedAddress,
  ): Promise<CanonicalTokenCall | null>;
  public abstract findRecent(
    limit: number,
  ): Promise<ReadonlyArray<CanonicalTokenCall>>;
  /**
   * Total canonical calls count. Used by the dashboard KPI endpoint to
   * avoid fetching all rows just to count them.
   */
  public abstract count(): Promise<number>;
}
