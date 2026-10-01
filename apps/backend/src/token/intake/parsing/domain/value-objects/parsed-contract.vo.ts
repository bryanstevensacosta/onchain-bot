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
import { ValueObject } from 'shared/kernel/value-object';
import { DomainError, ErrorCode } from 'shared/kernel/domain-error';
import { ContractAddress } from 'token/identity/contract-address.vo';

interface ParsedContractProps {
  readonly address: ContractAddress;
}

/**
 * The "primary" contract address for a parsed call.
 *
 * Selection rule: first contract address in the message, with EVM/Solana
 * being equally valid (chain-detection BC may further resolve).
 */
export class ParsedContract extends ValueObject<ParsedContractProps> {
  protected constructor(props: ParsedContractProps) {
    super(props);
  }

  public static fromAddresses(
    addresses: ReadonlyArray<ContractAddress>,
  ): ParsedContract {
    if (addresses.length === 0) {
      throw new DomainError(
        ErrorCode.NO_CONTRACT_ADDRESS,
        `Cannot build ParsedContract from empty addresses`,
      );
    }
    return new ParsedContract({ address: addresses[0] });
  }

  public get address(): ContractAddress {
    return this.props.address;
  }
}
