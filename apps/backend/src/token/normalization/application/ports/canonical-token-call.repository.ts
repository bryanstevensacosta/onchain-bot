import { CanonicalTokenCall } from 'token/normalization/domain/entities/canonical-token-call.entity';
import { ChainFamily } from 'chain/identity/chain-family.vo';
import { NormalizedAddress } from 'token/normalization/domain/value-objects/normalized-address.vo';

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
