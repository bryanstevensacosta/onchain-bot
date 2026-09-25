import { ValueObject } from 'shared/kernel/value-object';
import { ChainIdVo } from 'shared/value-objects/chain-id.vo';
import { AddressKind, normalizeAddressKind } from './address-kind';

/**
 * AddressId VO (Tramo 3, P45 — absorbs TokenIdVo).
 *
 * Universal identity: `chain` (mandatory qualifier, lowercased) +
 * `address` (raw value, lowercased key form) + `kind` discriminator
 * (wallet | token | program | exchange | unknown). The canonical key
 * stays `${chain}:${address}` — the same key rule as the backend
 * canonical call — with kind carried alongside (equality includes it).
 *
 * Unknown kinds never crash: any unrecognized kind string normalizes
 * to explicit `unknown`.
 */
export class AddressIdVo extends ValueObject<{
  chain: string;
  address: string;
  kind: AddressKind;
}> {
  protected constructor(chain: string, address: string, kind: AddressKind) {
    super({ chain, address, kind });
  }

  public static from(
    chain: string,
    address: string,
    kind?: unknown,
  ): AddressIdVo {
    const normalizedChain = ChainIdVo.from(chain).raw;
    const normalizedAddress = (address ?? '').trim().toLowerCase();
    if (normalizedAddress === '') {
      throw new Error('AddressId address must be a non-empty string');
    }
    return new AddressIdVo(
      normalizedChain,
      normalizedAddress,
      normalizeAddressKind(kind ?? 'unknown'),
    );
  }

  public static parse(key: string, kind?: unknown): AddressIdVo {
    const separator = (key ?? '').indexOf(':');
    if (separator <= 0) {
      throw new Error(`Invalid address key (expected chain:address): ${key}`);
    }
    return AddressIdVo.from(
      key.slice(0, separator),
      key.slice(separator + 1),
      kind,
    );
  }

  public get chain(): string {
    return this.props.chain;
  }

  public get address(): string {
    return this.props.address;
  }

  public get kind(): AddressKind {
    return this.props.kind;
  }

  public get key(): string {
    return `${this.props.chain}:${this.props.address}`;
  }
}
