import { CanonicalTokenCall } from 'discovery/normalization/domain/entities/canonical-token-call.entity';
import { Chain } from 'discovery/normalization/domain/value-objects/chain.vo';
import { NormalizedAddress } from 'discovery/normalization/domain/value-objects/normalized-address.vo';

/**
 * Outbound port: persistence for canonical token calls.
 *
 * Indexed by `(chain, address)` composite identity.
 */
export abstract class CanonicalTokenCallRepository {
  public abstract save(call: CanonicalTokenCall): Promise<void>;
  public abstract findByIdentity(
    chain: Chain,
    address: NormalizedAddress,
  ): Promise<CanonicalTokenCall | null>;
  public abstract findRecent(
    limit: number,
  ): Promise<ReadonlyArray<CanonicalTokenCall>>;
}
