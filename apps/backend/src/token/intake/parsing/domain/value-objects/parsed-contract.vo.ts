import { ValueObject } from 'shared/kernel/value-object';
import { DomainError, ErrorCode } from 'shared/kernel/domain-error';
import { ContractAddress } from 'token/intake/extraction/domain/value-objects/contract-address.vo';

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
